import { money } from "./currency";
import type { KpiState, Terms } from "./rules";

export function termsSummary(t: Terms | null) {
  if (!t) return null;
  const fix = money(t.fixAmount, t.currency);
  if (!t.sharePct || !t.shareBase) return `${fix} фикс`;
  const base =
    t.shareBase === "client_profit" ? "(доход − бюджет − фикс)" : t.shareBase === "client_revenue" ? "дохода клиента" : "рекл. бюджета";
  return `${fix} + ${t.sharePct}% от ${base}`;
}

const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** Where a client stands with payments today, in one line — the same on every tab. */
export function payStatus(
  pay: { paidThrough: string | null; debt: number; currency: string } | null,
  today: string,
  hasOpenInvoice: boolean,
): { tone: "good" | "warning" | "bad" | "info"; label: string; hint: string | null } {
  if (!pay) return { tone: "info", label: "Нет условий", hint: null };
  const owes = pay.debt >= 1 ? `не оплачено ${money(pay.debt, pay.currency)}` : null;
  if (pay.paidThrough && pay.paidThrough >= today) return { tone: owes ? "warning" : "good", label: `Оплачено по ${dm(pay.paidThrough)}`, hint: owes };
  if (pay.paidThrough) return { tone: "bad", label: `Оплата кончилась ${dm(pay.paidThrough)}`, hint: owes };
  return { tone: hasOpenInvoice ? "warning" : "bad", label: hasOpenInvoice ? "Счёт выставлен" : "Не оплачено", hint: owes };
}

export const KPI_LABEL: Record<KpiState, string> = { met: "KPI выполнен", missed: "KPI не выполнен", unknown: "нет данных KPI" };
export const KPI_TONE: Record<KpiState, "good" | "bad" | "info"> = { met: "good", missed: "bad", unknown: "info" };

export const STAFF_ROLES = [
  { value: "media_buyer", label: "MediaBuyer" },
  { value: "smm", label: "SMM" },
  { value: "sales", label: "Sales" },
  { value: "other", label: "Другое" },
];
export const roleLabel = (r: string) => STAFF_ROLES.find((x) => x.value === r)?.label ?? r;
