import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, projectPlans, projects, type ProjectRow } from "@/db/schema";
import type { MonthPlan, Metrics, Project } from "@/lib/domain/types";
import { currentMonth, monthEnd, monthOf, monthStart, planForRange } from "@/lib/projects/plans";
import { realTotals } from "@/lib/integrations/store";
import type { DataSource, Range } from "../source";

const totals = {
  spend: sql<number | null>`sum(${adMetricsDaily.spend})`,
  impressions: sql<number | null>`sum(${adMetricsDaily.impressions})`,
  clicks: sql<number | null>`sum(${adMetricsDaily.clicks})`,
  leads: sql<number | null>`sum(${adMetricsDaily.leads})`,
  subscribers: sql<number | null>`sum(${adMetricsDaily.subscribers})`,
  sales: sql<number | null>`sum(${adMetricsDaily.sales})`,
  revenue: sql<number | null>`sum(${adMetricsDaily.revenue})`,
  days: sql<number>`count(*)`,
};

/** Postgres returns sums as strings; values are coerced in toMetrics. */
type Totals = Record<keyof typeof totals, number | string | null>;

/** No synced rows = no data (empty object), so the UI shows «—» instead of zeros. */
function toMetrics(row: Totals | undefined): Metrics {
  if (!row || Number(row.days) === 0) return {};
  const metrics: Metrics = {};
  for (const key of ["spend", "impressions", "clicks", "leads", "subscribers", "sales", "revenue"] as const) {
    if (row[key] !== null) metrics[key] = Number(row[key]);
  }
  return metrics;
}

/**
 * The ad cabinet only counts the conversions it tracks. When the project has a lead sheet or CRM, its real
 * leads (without spam) and sales replace the cabinet's numbers — KPIs, CPL and ROAS are then about real results.
 */
function withReal(metrics: Metrics, real: { leads?: number; sales?: number; revenue?: number } | undefined): Metrics {
  if (!real) return metrics;
  return { ...metrics, ...real };
}

function toProject(row: ProjectRow, metrics: Metrics, plans: MonthPlan[], range: Range): Project {
  const fallback = row.kpis.length || row.budgetMonth !== null ? { kpis: row.kpis, budgetMonth: row.budgetMonth ?? null } : null;
  const plan = planForRange(plans, range.start, range.end, monthOf(row.periodStart), fallback);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    goal: row.goal,
    startDate: row.periodStart,
    period: range,
    kpis: plan.kpis,
    plans,
    planCarried: plan.carried,
    sources: row.sources,
    notes: row.notes,
    owners: { smm: row.smmEmail ?? null, mediaBuyer: row.mediaBuyerEmail ?? null },
    agent: {
      leadActions: row.leadActions ?? [],
      metaActions: { leads: row.metaActions?.leads ?? [], subscribers: row.metaActions?.subscribers ?? [] },
      currency: row.currency ?? null,
      // Budget of the range from the monthly plans; the project-level value is the current month's mirror.
      budgetMonth: plan.budget ?? row.budgetMonth ?? null,
      dailyReport: row.agentDailyReport ?? true,
      leadSource: row.agentLeadSource ?? "ads",
    },
    metrics,
  };
}

/** Default view: the current calendar month (it ends in the future — the plan is for the whole month). */
export const thisMonth = (): Range => ({ start: monthStart(currentMonth()), end: monthEnd(currentMonth()) });

async function loadPlans(ids: string[]) {
  const by = new Map<string, MonthPlan[]>();
  if (!ids.length) return by;
  const rows = await getDb().select().from(projectPlans).where(inArray(projectPlans.projectId, ids)).orderBy(asc(projectPlans.month));
  for (const r of rows) {
    const list = by.get(r.projectId) ?? [];
    list.push({ month: r.month, kpis: r.kpis, budgetMonth: r.budgetMonth ?? null });
    by.set(r.projectId, list);
  }
  return by;
}

const inRange = (range: Range) =>
  and(eq(adMetricsDaily.projectId, projects.id), gte(adMetricsDaily.date, range.start), lte(adMetricsDaily.date, range.end));

export const dbSource: DataSource = {
  async listProjects(range = thisMonth()) {
    const db = getDb();
    const [rows, sums] = await Promise.all([
      db.select().from(projects).orderBy(asc(projects.position), asc(projects.createdAt)),
      db
        .select({ projectId: projects.id, ...totals })
        .from(projects)
        .innerJoin(adMetricsDaily, inRange(range))
        .groupBy(projects.id),
    ]);
    const byProject = new Map(sums.map((s) => [s.projectId, s]));
    const ids = rows.map((r) => r.id);
    const [real, plans] = await Promise.all([realTotals(ids, new Map(ids.map((id) => [id, range]))), loadPlans(ids)]);
    return rows.map((row) => toProject(row, withReal(toMetrics(byProject.get(row.id)), real.get(row.id)), plans.get(row.id) ?? [], range));
  },

  async getProject(id, range = thisMonth()) {
    const db = getDb();
    const [[row], [sum]] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, id)).limit(1),
      db
        .select(totals)
        .from(projects)
        .innerJoin(adMetricsDaily, inRange(range))
        .where(eq(projects.id, id)),
    ]);
    if (!row) return null;
    const [real, plans] = await Promise.all([realTotals([row.id], new Map([[row.id, range]])), loadPlans([row.id])]);
    return toProject(row, withReal(toMetrics(sum), real.get(row.id)), plans.get(row.id) ?? [], range);
  },
};
