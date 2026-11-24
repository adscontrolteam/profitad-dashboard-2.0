import { addMonths, monthStart } from "@/lib/projects/plans";
import { convert } from "./fx";
import { listMethods, saveInvoice, setInvoiceItems, listCompanies, type Invoice, type PaymentMethod } from "./store";
import { buildFinanceReport, type ProjectFin } from "./report";
import type { InvoiceItem, InvoiceRecipient } from "@/db/schema";

/**
 * Monthly invoices issued by the dashboard itself.
 *
 * From the 25th of a month every project in work gets an invoice for the NEXT month, dated the 1st of that
 * month: the fix of the next month + the share (% of income) earned in the current month so far.
 * In the first days of the new month the share is counted again on the whole closed month — the sales of the
 * last days are added — while the invoice is still not paid.
 *
 * Who issued an invoice is kept in `createdBy`: only the ones issued here are ever recounted, an invoice made
 * or edited by a person is never touched.
 */
export const AUTO = "auto";
/** The day of the month the invoices for the next month appear. */
export const ISSUE_DAY = 25;
/** The first days of a month the share of the closed month is recounted. */
export const RECOUNT_DAYS = 3;

const round2 = (v: number) => Math.round(v * 100) / 100;
const monthName = (m: string) => `${m.slice(5, 7)}.${m.slice(0, 4)}`;

/** What a project owes for `forMonth`: its fix + the share earned in `shareMonth`, in the terms currency. */
export function dueFor(p: ProjectFin, forMonth: string, shareMonth: string): { fix: number; share: number; currency: string } | null {
  const t = p.terms;
  if (!t || t.startMonth > forMonth || p.status === "archived") return null;
  const fix = p.overrides.find((o) => o.month === forMonth)?.fixAmount ?? t.fixAmount;
  const share = p.months.find((m) => m.month === shareMonth)?.accrual?.share ?? 0;
  if (fix <= 0 && share <= 0) return null;
  return { fix: round2(fix), share: round2(share), currency: t.currency };
}

/** Lines of the invoice in the invoice currency; `rate` = invoice-currency units per one unit of the terms currency. */
export function itemsFor(due: { fix: number; share: number }, service: string, shareMonth: string, rate: number): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  if (due.fix > 0) items.push({ name: service, qty: 1, amount: round2(due.fix * rate) });
  if (due.share > 0) items.push({ name: `${service} — % від доходу за ${monthName(shareMonth)}`, qty: 1, amount: round2(due.share * rate) });
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

export async function runAutoInvoices(today = new Date()): Promise<AutoInvoiceResult> {
  const out: AutoInvoiceResult = { created: [], recounted: [], skipped: [] };
  const day = today.getUTCDate();
  if (day < ISSUE_DAY && day > RECOUNT_DAYS) return out;

  const [r, methods, companies] = await Promise.all([buildFinanceReport(), listMethods(), listCompanies()]);
  const fops = methods.filter((m) => m.kind === "fop");
  const live = (x: Invoice) => x.document && x.status !== "cancelled";

  if (day >= ISSUE_DAY) {
    const forMonth = addMonths(r.now, 1);
    for (const p of r.projects) {
      const due = dueFor(p, forMonth, r.now);
      if (!due) continue;
      if (r.invoices.some((x) => x.projectId === p.id && x.month === forMonth && live(x))) continue;
      // The account, the currency and the wording are taken from the project's last invoice: that is how this
      // client is billed. A client never billed before goes to the first account in the client's currency.
      const last = r.invoices.find((x) => x.projectId === p.id && live(x)) ?? null;
      const method =
        (last && methods.find((m) => m.id === last.methodId)) || methods.find((m) => m.currency === due.currency) || methods[0] || null;
      if (!method && !last) {
        out.skipped.push({ project: p.name, why: "нет ни одного счёта для оплаты в «Инвойсах»" });
        continue;
      }
      const currency = last?.currency ?? method!.currency;
      const rate = currency === due.currency ? 1 : Math.round(convert(1, due.currency, currency, r.rates) * 10000) / 10000;
      const service = last?.items[0]?.name || method?.serviceName || "Інформаційні послуги";
      const items = itemsFor(due, service, r.now, rate);
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
          contractCurrency: currency === due.currency ? null : due.currency,
          fxRate: currency === due.currency ? null : rate,
          document: true,
          status: "issued",
          paidDate: null,
          note: `Выставлен автоматически ${today.toISOString().slice(0, 10)}`,
        },
        AUTO,
      );
      out.created.push({ project: p.name, month: forMonth, total: round2(items.reduce((a, i) => a + i.amount, 0)), currency });
    }
  }

  if (day <= RECOUNT_DAYS) {
    const closed = addMonths(r.now, -1);
    for (const inv of r.invoices) {
      if (inv.createdBy !== AUTO || inv.month !== r.now || inv.status !== "issued" || !inv.document) continue;
      const p = r.projects.find((x) => x.id === inv.projectId);
      const due = p ? dueFor(p, r.now, closed) : null;
      if (!p || !due || !p.terms?.sharePct) continue;
      const rate = inv.contractCurrency && inv.fxRate ? inv.fxRate : 1;
      const items = itemsFor(due, inv.items[0]?.name || "Інформаційні послуги", closed, rate);
      const total = round2(items.reduce((a, i) => a + i.amount, 0));
      if (Math.abs(total - inv.total) < 0.01) continue;
      await setInvoiceItems(inv.id, items);
      out.recounted.push({ project: p.name, from: inv.total, to: total, currency: inv.currency });
    }
  }
  return out;
}
