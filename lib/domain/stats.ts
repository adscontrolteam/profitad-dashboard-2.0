import type {
  Kpi,
  KpiStats,
  Metrics,
  Project,
  ProjectStats,
  ProjectWithStats,
  StatusSummary,
} from "./types";
import { PROJECT_STATUSES } from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const safeDivide = (a: number, b: number) => (b === 0 ? 0 : a / b);

function computeKpiStats(kpi: Kpi, metrics: Metrics, elapsed: number): KpiStats {
  const fact = metrics[kpi.metric] ?? 0;
  const forecast = elapsed > 0 ? fact / elapsed : 0;
  const hasData = metrics[kpi.metric] !== undefined;
  const hasPlan = kpi.plan !== null && kpi.plan > 0;
  const canJudge = hasData && hasPlan;
  const spend = metrics.spend;

  return {
    kpi,
    fact,
    forecast,
    progress: canJudge ? fact / kpi.plan! : null,
    pace: canJudge ? forecast / kpi.plan! : null,
    cpaFact: spend !== undefined && fact > 0 ? spend / fact : null,
  };
}

export function computeStats(project: Project, now: Date): ProjectStats {
  const start = Date.parse(project.period.start);
  // The end date is inclusive: the period lasts until the end of that day.
  const end = Date.parse(project.period.end) + 86_400_000;
  const elapsed = clamp(safeDivide(now.getTime() - start, end - start), 0, 1);
  const results = project.kpis.map((kpi) => computeKpiStats(kpi, project.metrics, elapsed));

  return { elapsed, results, primary: results[0] ?? null };
}

export function withStats(project: Project, now: Date): ProjectWithStats {
  return { ...project, stats: computeStats(project, now) };
}

export function summarizeStatuses(projects: Project[]): StatusSummary {
  const summary = Object.fromEntries(
    PROJECT_STATUSES.map((status) => [status, 0]),
  ) as StatusSummary;
  for (const project of projects) summary[project.status] += 1;
  return summary;
}

/**
 * From this pace on the project counts as «в плане». Not a strict 1: results come in whole units and today's are
 * still arriving, so a project that is a hair under the line (12 of the 12.1 due by now) is on plan, not behind.
 */
export const PACE_ON_PLAN = 0.95;
/** Below this the gap is serious (red). */
export const PACE_WARNING = 0.85;

/** "none" = nothing to judge yet (no plan set or no synced data). */
export type PaceLevel = "good" | "warning" | "bad" | "none";

export function paceLevel(pace: number | null | undefined): PaceLevel {
  if (pace === null || pace === undefined) return "none";
  if (pace >= PACE_ON_PLAN) return "good";
  if (pace >= PACE_WARNING) return "warning";
  return "bad";
}

/** The tempo that says «догоняем» is the one of the last two whole days: a week is too long to notice a turn. */
export const CATCH_UP_DAYS = 2;

export interface CatchUp {
  /** Results still missing to the plan. */
  missing: number;
  /** Per day needed until the end of the period to close the plan. */
  needPerDay: number;
  /** Per day over the last CATCH_UP_DAYS whole days. */
  recentPerDay: number;
  /** True when the recent tempo is enough to reach the plan by the end of the period. */
  catching: boolean;
}

/**
 * Behind the plan — but are the last two days fast enough to close the gap? `recent` = results of those days. Null when the project is on plan,
 * the period is over or there is no plan.
 */
export function catchUp(input: { plan: number | null; fact: number; pace: number | null; elapsed: number; periodDays: number; recent: number }): CatchUp | null {
  if (!input.plan || input.pace === null || input.pace >= PACE_ON_PLAN || input.elapsed >= 1) return null;
  const daysLeft = (1 - input.elapsed) * input.periodDays;
  const missing = Math.max(input.plan - input.fact, 0);
  const needPerDay = daysLeft > 0 ? missing / daysLeft : missing;
  const recentPerDay = input.recent / CATCH_UP_DAYS;
  return { missing, needPerDay, recentPerDay, catching: missing > 0 && recentPerDay >= needPerDay };
}

export const periodDays = (period: { start: string; end: string }) => Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86_400_000) + 1;
