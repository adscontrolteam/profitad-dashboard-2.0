import { GOAL_LEVELS, type Kpi, type MonthPlan } from "@/lib/domain/types";

const DAY = 86_400_000;

export const monthOf = (iso: string) => iso.slice(0, 7);
export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const monthStart = (month: string) => `${month}-01`;
export const monthEnd = (month: string) => `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
export const currentMonth = () => new Date().toISOString().slice(0, 7);

export function addMonths(month: string, n: number) {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Months touched by a date range, oldest first. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let m = monthOf(from); m <= monthOf(to) && out.length < 240; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * The plan in force in a month: its own, else the latest earlier one (a plan stays until the next is set).
 * No plan before the start of work. `fallback` covers projects that have no monthly plans yet.
 */
export function planFor(plans: MonthPlan[], month: string, startMonth: string, fallback: Omit<MonthPlan, "month"> | null) {
  if (month < startMonth) return null;
  let found: MonthPlan | null = null;
  for (const p of plans) if (p.month <= month && (!found || p.month > found.month)) found = p;
  if (found) return { ...found, carried: found.month !== month };
  return fallback ? { month, ...fallback, carried: true } : null;
}

/**
 * Plan for an arbitrary range: each month's plan counts in proportion to its days inside the range
 * (a full month = its whole plan). Price targets come from the latest month that has one.
 */
export function planForRange(
  plans: MonthPlan[],
  from: string,
  to: string,
  startMonth: string,
  fallback: Omit<MonthPlan, "month"> | null,
): { kpis: Kpi[]; budget: number | null; carried: boolean } {
  const order: Kpi["metric"][] = [];
  // Per metric and goal level (Б / Б+ / С): prorated amount, latest price.
  const amount = new Map<string, number | null>();
  const price = new Map<string, number | null>();
  let budget: number | null = null;
  let carried = false;
  const months = monthsBetween(from, to);
  for (const month of months) {
    const p = planFor(plans, month, startMonth, fallback);
    if (!p) continue;
    if (month === months[months.length - 1]) carried = p.carried;
    const a = from > monthStart(month) ? from : monthStart(month);
    const b = to < monthEnd(month) ? to : monthEnd(month);
    const share = (Date.parse(b) - Date.parse(a) + DAY) / DAY / daysInMonth(month);
    if (p.budgetMonth !== null) budget = (budget ?? 0) + p.budgetMonth * share;
    for (const k of p.kpis) {
      if (!order.includes(k.metric)) order.push(k.metric);
      for (const lv of GOAL_LEVELS) {
        const key = `${k.metric}:${lv.key}`;
        const v = (k[lv.plan] as number | null | undefined) ?? null;
        if (v !== null) amount.set(key, (amount.get(key) ?? 0) + v * share);
        const c = (k[lv.cpa] as number | null | undefined) ?? null;
        if (c !== null) price.set(key, c);
      }
    }
  }
  // The latest month's order decides which result is the primary one.
  const last = months.length ? planFor(plans, months[months.length - 1], startMonth, fallback) : null;
  const primaryOrder = [...(last?.kpis.map((k) => k.metric) ?? []), ...order].filter((m, i, all) => all.indexOf(m) === i);
  const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
  return {
    kpis: primaryOrder.map((metric) => {
      const kpi: Kpi = { metric, plan: null, cpaPlan: null };
      for (const lv of GOAL_LEVELS) {
        (kpi as unknown as Record<string, number | null>)[lv.plan] = round(amount.get(`${metric}:${lv.key}`));
        (kpi as unknown as Record<string, number | null>)[lv.cpa] = price.get(`${metric}:${lv.key}`) ?? null;
      }
      return kpi;
    }),
    budget: round(budget),
    carried,
  };
}
