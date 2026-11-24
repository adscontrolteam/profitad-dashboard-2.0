import { addMonths, monthStart } from "@/lib/projects/plans";
import { convert } from "./fx";
import { listMethods, saveInvoice, setInvoiceItems, listCompanies, type PaymentMethod } from "./store";
import { buildFinanceReport } from "./report";
import type { InvoiceItem, InvoiceRecipient } from "@/db/schema";

/**
 * Monthly invoices issued by the dashboard itself.
 *
 * A client pays in advance, by months. From the 25th every project in work gets an invoice for the NEXT month,
 * dated the 1st of that month — unless the client has already paid for it or an invoice for it exists (a payment
 * recorded without an invoice counts too). One open invoice per client at a time.
 *
 * The invoice is the fee of the next month + the share (% of income) earned in the current month so far. In the
 * first days of the new month the share is counted again on the whole closed month — never on the sales of the new
 * one — while the invoice is still not paid.
 *
 * Who issued an invoice is kept in `createdBy`: only the ones issued here are ever recounted.
 */
export const AUTO = "auto";
/** The day of the month the invoices for the next month appear. */
export const ISSUE_DAY = 25;
/** The first days of a month the share of the closed month is recounted. */
export const RECOUNT_DAYS = 3;

const round2 = (v: number) => Math.round(v * 100) / 100;
const monthName = (m: string) => `${m.slice(5, 7)}.${m.slice(0, 4)}`;

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
  created: { project: string; month: string; total: number; currency: string }[];
  recounted: { project: string; from: number; to: number; currency: string }[];
  skipped: { project: string; why: string }[];
}

export async function runAutoInvoices(now = new Date()): Promise<AutoInvoiceResult> {
  const out: AutoInvoiceResult = { created: [], recounted: [], skipped: [] };
  const day = now.getUTCDate();
  if (day < ISSUE_DAY && day > RECOUNT_DAYS) return out;

  const [r, methods, companies] = await Promise.all([buildFinanceReport(), listMethods(), listCompanies()]);
  const today = now.toISOString().slice(0, 10);
  const fops = methods.filter((m) => m.kind === "fop");

  if (day >= ISSUE_DAY) {
    const forMonth = addMonths(r.now, 1);
    for (const p of r.projects) {
      if (p.status !== "active" || !p.terms || p.terms.startMonth > forMonth) continue;
      const mine = r.invoices.filter((x) => x.projectId === p.id && x.status !== "cancelled");
      // Already paid for, or already invoiced — with or without a document.
      if (mine.some((x) => x.month === forMonth)) continue;
      // One open invoice at a time: the next one waits until this one is paid or cancelled.
      if (mine.some((x) => x.status === "issued")) continue;

      const fix = round2(p.overrides.find((o) => o.month === forMonth)?.fixAmount ?? p.terms.fixAmount);
      // The share belongs to a calendar month: the current one, counted on what has come so far.
      const share = p.terms.sharePct ? round2(p.months.find((m) => m.month === r.now)?.accrual?.share ?? 0) : 0;
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
      const items = itemsFor(fix, share, service, r.now, rate);
      await saveInvoice(
        {
          projectId: p.id,
          month: forMonth,
          issueDate: monthStart(forMonth),
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
        },
        AUTO,
      );
      out.created.push({ project: p.name, month: forMonth, total: round2(items.reduce((a, i) => a + i.amount, 0)), currency });
    }
  }

  // The first days of a month: the share of the month just closed is final now — and only that month's.
  if (day <= RECOUNT_DAYS) {
    const closed = addMonths(r.now, -1);
    for (const inv of r.invoices) {
      if (inv.createdBy !== AUTO || inv.month !== r.now || inv.status !== "issued" || !inv.document) continue;
      const p = r.projects.find((x) => x.id === inv.projectId);
      if (!p || !p.terms?.sharePct) continue;
      const fix = round2(p.overrides.find((o) => o.month === r.now)?.fixAmount ?? p.terms.fixAmount);
      const share = round2(p.months.find((m) => m.month === closed)?.accrual?.share ?? 0);
      const rate = inv.contractCurrency && inv.fxRate ? inv.fxRate : 1;
      const items = itemsFor(fix, share, inv.items[0]?.name || "Інформаційні послуги", closed, rate);
      const total = round2(items.reduce((a, i) => a + i.amount, 0));
      if (Math.abs(total - inv.total) < 0.01) continue;
      await setInvoiceItems(inv.id, items);
      out.recounted.push({ project: p.name, from: inv.total, to: total, currency: inv.currency });
    }
  }
  return out;
}
