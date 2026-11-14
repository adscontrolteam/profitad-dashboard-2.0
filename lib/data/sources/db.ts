import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, projects, type ProjectRow } from "@/db/schema";
import type { Metrics, Project } from "@/lib/domain/types";
import { realTotals } from "@/lib/integrations/store";
import type { DataSource } from "../source";

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

function toProject(row: ProjectRow, metrics: Metrics): Project {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    goal: row.goal,
    period: { start: row.periodStart, end: row.periodEnd },
    kpis: row.kpis,
    sources: row.sources,
    notes: row.notes,
    owners: { smm: row.smmEmail ?? null, mediaBuyer: row.mediaBuyerEmail ?? null },
    agent: {
      leadActions: row.leadActions ?? [],
      currency: row.currency ?? null,
      budgetMonth: row.budgetMonth ?? null,
      dailyReport: row.agentDailyReport ?? true,
    },
    metrics,
  };
}

const periodJoin = and(
  eq(adMetricsDaily.projectId, projects.id),
  gte(adMetricsDaily.date, projects.periodStart),
  lte(adMetricsDaily.date, projects.periodEnd),
);

export const dbSource: DataSource = {
  async listProjects() {
    const db = getDb();
    const [rows, sums] = await Promise.all([
      db.select().from(projects).orderBy(asc(projects.position), asc(projects.createdAt)),
      db
        .select({ projectId: projects.id, ...totals })
        .from(projects)
        .innerJoin(adMetricsDaily, periodJoin)
        .groupBy(projects.id),
    ]);
    const byProject = new Map(sums.map((s) => [s.projectId, s]));
    const real = await realTotals(rows.map((r) => r.id), new Map(rows.map((r) => [r.id, { start: r.periodStart, end: r.periodEnd }])));
    return rows.map((row) => toProject(row, withReal(toMetrics(byProject.get(row.id)), real.get(row.id))));
  },

  async getProject(id) {
    const db = getDb();
    const [[row], [sum]] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, id)).limit(1),
      db
        .select(totals)
        .from(projects)
        .innerJoin(adMetricsDaily, periodJoin)
        .where(eq(projects.id, id)),
    ]);
    if (!row) return null;
    const real = await realTotals([row.id], new Map([[row.id, { start: row.periodStart, end: row.periodEnd }]]));
    return toProject(row, withReal(toMetrics(sum), real.get(row.id)));
  },
};
