import type { MonthPlan, ResultMetric } from "@/lib/domain/types";
import { daysInMonth, monthEnd, monthOf, monthStart, planFor } from "./plans";

const DAY = 86_400_000;

/** A week's number can be a result of the plan («Б» level) or the ad budget of the week. */
export type WeekMetric = ResultMetric | "spend";

export interface WeekOverride {
  weekStart: string;
  metric: WeekMetric;
  plan: number;
}

export interface WeekPlanValue {
  plan: number;
  /** Set by a person; otherwise the month's plan split by days. */
  manual: boolean;
}

export type WeekPlan = Partial<Record<WeekMetric, WeekPlanValue>>;

export const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

/** Monday of the week the date falls into (weeks run Mon–Sun). */
export function weekStartOf(iso: string) {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export const weekEnd = (weekStart: string) => addDays(weekStart, 6);
export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/** Weeks that touch a month, oldest first. */
export function weeksOfMonth(month: string) {
  const out: string[] = [];
  for (let w = weekStartOf(monthStart(month)); w <= monthEnd(month); w = addDays(w, 7)) out.push(w);
  return out;
}

type Fallback = Omit<MonthPlan, "month"> | null;

function monthAmount(plans: MonthPlan[], month: string, metric: WeekMetric, startMonth: string, fallback: Fallback) {
  const p = planFor(plans, month, startMonth, fallback);
  if (!p) return null;
  if (metric === "spend") return p.budgetMonth;
  return p.kpis.find((k) => k.metric === metric)?.plan ?? null;
}

/**
 * Plan of one day of a month for a metric. The month's plan is spread evenly over its days. Days of weeks corrected
 * by hand take that week's number instead (a seventh per day), and what is left of the month's plan is spread over
 * the remaining days from `frozenBefore` on — so the month still adds up to its plan, and weeks already behind us
 * keep the plan they were judged against.
 */
function dayRates(
  plans: MonthPlan[],
  overrides: WeekOverride[],
  month: string,
  metric: WeekMetric,
  startMonth: string,
  fallback: Fallback,
  frozenBefore: string,
): { past: number; ahead: number } | null {
  const total = monthAmount(plans, month, metric, startMonth, fallback);
  if (total === null) return null;
  const even = total / daysInMonth(month);
  const manual = new Map<string, number>();
  for (const o of overrides) if (o.metric === metric) for (const d of weekDays(o.weekStart)) if (monthOf(d) === month) manual.set(d, o.plan / 7);
  let manualSum = 0;
  let pastFree = 0;
  let aheadFree = 0;
  for (let d = monthStart(month); d <= monthEnd(month); d = addDays(d, 1)) {
    const own = manual.get(d);
    if (own !== undefined) manualSum += own;
    else if (d < frozenBefore) pastFree += 1;
    else aheadFree += 1;
  }
  return { past: even, ahead: aheadFree > 0 ? Math.max(total - manualSum - pastFree * even, 0) / aheadFree : 0 };
}

const round = (v: number, metric: WeekMetric) => (metric === "spend" || metric === "revenue" ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10);

/** Metrics that have a plan in any month the week touches: results first (in the plan's order), the budget last. */
function weekMetrics(plans: MonthPlan[], weekStart: string, startMonth: string, fallback: Fallback): WeekMetric[] {
  const out: WeekMetric[] = [];
  let budget = false;
  for (const month of new Set([monthOf(weekStart), monthOf(weekEnd(weekStart))])) {
    const p = planFor(plans, month, startMonth, fallback);
    if (!p) continue;
    for (const k of p.kpis) if (k.plan !== null && !out.includes(k.metric)) out.push(k.metric);
    if (p.budgetMonth !== null) budget = true;
  }
  return budget ? [...out, "spend"] : out;
}

/** The plan of a week: manual numbers where set, the split of the month's plan elsewhere. */
export function weekPlan(
  plans: MonthPlan[],
  overrides: WeekOverride[],
  weekStart: string,
  startMonth: string,
  fallback: Fallback,
  /** Monday of the current week: earlier weeks are not recalculated when a later one is corrected. */
  frozenBefore: string = weekStartOf(new Date().toISOString().slice(0, 10)),
  /** Count only these days of the week — the part of an edge week that lies inside the month shown. */
  clip?: { from: string; to: string },
): WeekPlan {
  const days = weekDays(weekStart).filter((d) => !clip || (d >= clip.from && d <= clip.to));
  const out: WeekPlan = {};
  for (const metric of weekMetrics(plans, weekStart, startMonth, fallback)) {
    const own = overrides.find((o) => o.weekStart === weekStart && o.metric === metric);
    if (own) {
      out[metric] = { plan: round((own.plan * days.length) / 7, metric), manual: true };
      continue;
    }
    let sum = 0;
    let any = false;
    const rates = new Map<string, { past: number; ahead: number } | null>();
    for (const day of days) {
      const month = monthOf(day);
      if (!rates.has(month)) rates.set(month, dayRates(plans, overrides, month, metric, startMonth, fallback, frozenBefore));
      const rate = rates.get(month) ?? null;
      if (rate === null) continue;
      any = true;
      sum += day < frozenBefore ? rate.past : rate.ahead;
    }
    if (any) out[metric] = { plan: round(sum, metric), manual: false };
  }
  return out;
}

/** Share of the week that has fully passed by `today` (0 on Monday morning, 1 after Sunday). */
export function weekElapsed(weekStart: string, today: string) {
  const days = Math.round((Date.parse(today) - Date.parse(weekStart)) / DAY);
  return Math.min(Math.max(days, 0), 7) / 7;
}

export interface MonthSegment {
  from: string;
  to: string;
  days: number;
  /** Mondays of the calendar weeks the segment is made of. */
  weeks: string[];
}

/**
 * A month cut into weeks from its 1st to its last day. An edge piece shorter than four days is not a week of its own:
 * it joins the neighbouring week (1–8 when the 1st is a Sunday), whose plan grows by the same days.
 */
export function monthSegments(month: string): MonthSegment[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const span = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const out: MonthSegment[] = weeksOfMonth(month).map((w) => {
    const from = w < first ? first : w;
    const to = weekEnd(w) > last ? last : weekEnd(w);
    return { from, to, days: span(from, to), weeks: [w] };
  });
  if (out.length > 1 && out[0].days < 4) {
    const [head, next] = out.splice(0, 2);
    out.unshift({ from: head.from, to: next.to, days: head.days + next.days, weeks: [...head.weeks, ...next.weeks] });
  }
  if (out.length > 1 && out[out.length - 1].days < 4) {
    const tail = out.pop() as MonthSegment;
    const prev = out.pop() as MonthSegment;
    out.push({ from: prev.from, to: tail.to, days: prev.days + tail.days, weeks: [...prev.weeks, ...tail.weeks] });
  }
  return out;
}
