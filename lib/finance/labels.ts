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

export const KPI_LABEL: Record<KpiState, string> = { met: "KPI выполнен", missed: "KPI не выполнен", unknown: "нет данных KPI" };
export const KPI_TONE: Record<KpiState, "good" | "bad" | "info"> = { met: "good", missed: "bad", unknown: "info" };

export const STAFF_ROLES = [
  { value: "media_buyer", label: "MediaBuyer" },
  { value: "smm", label: "SMM" },
  { value: "sales", label: "Sales" },
  { value: "other", label: "Другое" },
];
export const roleLabel = (r: string) => STAFF_ROLES.find((x) => x.value === r)?.label ?? r;
