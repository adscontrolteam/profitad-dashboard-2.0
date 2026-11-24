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

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const monthWord = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/** Where a client stands with payments, in one line — the same on every tab. */
export function payStatus(
  pay: { lastPaid: string | null; lastIsTest: boolean; debt: number; currency: string } | null,
  now: string,
  hasOpenInvoice: boolean,
): { tone: "good" | "warning" | "bad" | "info"; label: string; hint: string | null } {
  if (!pay) return { tone: "info", label: "Нет условий", hint: null };
  const owes = pay.debt >= 1 ? `не оплачено ${money(pay.debt, pay.currency)}` : null;
  if (pay.lastPaid && pay.lastPaid >= now) {
    return { tone: owes ? "warning" : "good", label: `Оплачен ${monthWord(pay.lastPaid)}${pay.lastIsTest ? " · тест" : ""}`, hint: owes };
  }
  if (hasOpenInvoice) return { tone: "warning", label: "Счёт выставлен", hint: owes };
  return { tone: owes ? "bad" : "info", label: owes ? `Не оплачен ${monthWord(now)}` : "Оплаты пока нет", hint: owes };
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
