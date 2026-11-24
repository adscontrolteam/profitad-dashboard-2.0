import { addMonths } from "@/lib/projects/plans";
import { convert } from "./fx";
import { daysBetween, daysIn, firstOf, monthOfDay } from "./periods";
import { listMethods, saveInvoice, setInvoiceItems, listCompanies, type PaymentMethod } from "./store";
import { buildFinanceReport, type ProjectFin } from "./report";
import type { InvoiceItem, InvoiceRecipient } from "@/db/schema";

/**
 * Invoices issued by the dashboard itself.
 *
 * A client pays in advance, so the next invoice is for the days right after everything already invoiced or paid
 * (lib/finance/periods.ts). It appears on the 25th of the month before for a client billed by calendar months, and
 * a week ahead for a client billed from their own day of the month. One open invoice per client at a time: while
 * one is waiting to be paid, no other is issued.
 *
 * The invoice is the fee for its period + the share (% of income) earned in the calendar month before the period
 * starts. In the first days of the new month that share is counted again on the whole closed month — never on the
 * sales of the new month — while the invoice is still not paid.
 *
 * Who issued an invoice is kept in `createdBy`: only the ones issued here are ever recounted.
 */
export const AUTO = "auto";
/** The first days of a month the share of the closed month is recounted. */
export const RECOUNT_DAYS = 3;

const round2 = (v: number) => Math.round(v * 100) / 100;
const monthName = (m: string) => `${m.slice(5, 7)}.${m.slice(0, 4)}`;
const dayName = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** The fee for a period, in the terms currency: whole for a month, by calendar days for a shorter stretch. */
export function feeForPeriod(p: ProjectFin, start: string, end: string) {
  const month = monthOfDay(start);
  const fee = p.overrides.find((o) => o.month === month)?.fixAmount ?? p.terms?.fixAmount ?? 0;
  const days = daysBetween(start, end);
  // A month from the 1st or day-to-day (28–31 days) is one fee; anything shorter is its share by days.
  return days >= 28 ? fee : round2((fee * days) / daysIn(month));
}

/** Lines of the invoice in the invoice currency; `rate` = invoice-currency units per one unit of the terms currency. */
export function itemsFor(fix: number, share: number, service: string, shareMonth: string, rate: number): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  if (fix > 0) items.push({ name: service, qty: 1, amount: round2(fix * rate) });
  if (share > 0) items.push({ name: `${service} — % від доходу за ${monthName(shareMonth)}`, qty: 1, amount: round2(share * rate) });
  return items;
}

function recipientOf(method: PaymentMethod, fops: PaymentMethod[], company: string): InvoiceRecipient {
  const base = { kind: method.kind, label: method.label, details: method.details as Record<string, string> };
  if (method.kind !== "link") return base;
  const sender = fops[0];
  return { ...base, intl: { fromLabel: sender?.label ?? "", from: (sender?.details as Record<string, string>) ?? {}, billTo: company } };
}

export interface AutoInvoiceResult {
  created: { project: string; period: string; total: number; currency: string }[];
  recounted: { project: string; from: number; to: number; currency: string }[];
  skipped: { project: string; why: string }[];
}

export async function runAutoInvoices(now = new Date()): Promise<AutoInvoiceResult> {
  const out: AutoInvoiceResult = { created: [], recounted: [], skipped: [] };
  const [r, methods, companies] = await Promise.all([buildFinanceReport(), listMethods(), listCompanies()]);
  const today = now.toISOString().slice(0, 10);
  const fops = methods.filter((m) => m.kind === "fop");

  for (const p of r.projects) {
    if (p.status !== "active" || !p.terms || !p.pay) continue;
    const mine = r.invoices.filter((x) => x.projectId === p.id && x.status !== "cancelled");
    // One open invoice at a time: the next one waits until this one is paid or cancelled.
    if (mine.some((x) => x.status === "issued")) continue;
    const { start, end, invoiceOn } = p.pay.next;
    if (today < invoiceOn) continue;

    const fix = feeForPeriod(p, start, end);
    // The share belongs to a calendar month: the one before the month the period starts in.
    const shareMonth = addMonths(monthOfDay(start), -1);
    const share = p.terms.sharePct ? round2(p.months.find((m) => m.month === shareMonth)?.accrual?.share ?? 0) : 0;
    if (fix <= 0 && share <= 0) continue;

    // The account, the currency and the wording are taken from the project's last invoice: that is how this
    // client is billed. A client never billed before goes to the first account in the client's currency.
    const last = mine.find((x) => x.document) ?? null;
    const method = (last && methods.find((m) => m.id === last.methodId)) || methods.find((m) => m.currency === p.terms!.currency) || methods[0] || null;
    if (!method && !last) {
      out.skipped.push({ project: p.name, why: "нет ни одного счёта для оплаты в «Инвойсах»" });
      continue;
    }
    const currency = last?.currency ?? method!.currency;
    const rate = currency === p.terms.currency ? 1 : Math.round(convert(1, p.terms.currency, currency, r.rates) * 10000) / 10000;
    const service = last?.items[0]?.name || method?.serviceName || "Інформаційні послуги";
    const items = itemsFor(fix, share, service, shareMonth, rate);
    await saveInvoice(
      {
        projectId: p.id,
        month: monthOfDay(start),
        issueDate: start,
        methodId: method?.id ?? last?.methodId ?? null,
        recipient: method ? recipientOf(method, fops, companies.get(p.id) ?? "") : (last?.recipient ?? null),
        currency,
        items,
        purpose: last?.purpose || method?.purpose || "",
        payLink: last?.payLink ?? "",
        contractCurrency: currency === p.terms.currency ? null : p.terms.currency,
        fxRate: currency === p.terms.currency ? null : rate,
        document: true,
        status: "issued",
        paidDate: null,
        note: `Выставлен автоматически ${today}`,
        periodStart: start,
        periodEnd: end,
      },
      AUTO,
    );
    out.created.push({ project: p.name, period: `${dayName(start)}–${dayName(end)}`, total: round2(items.reduce((a, i) => a + i.amount, 0)), currency });
  }

  // The first days of a month: the share of the month just closed is final now — and only that month's.
  if (now.getUTCDate() <= RECOUNT_DAYS) {
    const closed = addMonths(r.now, -1);
    for (const inv of r.invoices) {
      if (inv.createdBy !== AUTO || inv.status !== "issued" || !inv.document) continue;
      const period = r.periodOf[inv.id];
      const p = r.projects.find((x) => x.id === inv.projectId);
      // Only an invoice whose period starts in this month carries the share of the closed one.
      if (!p || !p.terms?.sharePct || !period || period.start < firstOf(r.now) || monthOfDay(period.start) !== r.now) continue;
      const share = round2(p.months.find((m) => m.month === closed)?.accrual?.share ?? 0);
      const rate = inv.contractCurrency && inv.fxRate ? inv.fxRate : 1;
      const items = itemsFor(feeForPeriod(p, period.start, period.end), share, inv.items[0]?.name || "Інформаційні послуги", closed, rate);
      const total = round2(items.reduce((a, i) => a + i.amount, 0));
      if (Math.abs(total - inv.total) < 0.01) continue;
      await setInvoiceItems(inv.id, items);
      out.recounted.push({ project: p.name, from: inv.total, to: total, currency: inv.currency });
    }
  }
  return out;
}
