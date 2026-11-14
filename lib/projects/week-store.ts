import "server-only";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projectPlans, projects, projectWeekPlans } from "@/db/schema";
import type { MonthPlan } from "@/lib/domain/types";
import { monthOf } from "./plans";
import { addDays, weekPlan, weekStartOf, type WeekMetric, type WeekOverride } from "./weeks";

const today = () => new Date().toISOString().slice(0, 10);

/** Weeks a person has corrected by hand. */
export async function listWeekOverrides(projectId: string): Promise<WeekOverride[]> {
  const rows = await getDb()
    .select({ weekStart: projectWeekPlans.weekStart, metric: projectWeekPlans.metric, plan: projectWeekPlans.plan })
    .from(projectWeekPlans)
    .where(and(eq(projectWeekPlans.projectId, projectId), eq(projectWeekPlans.manual, true)));
  return rows.map((r) => ({ weekStart: r.weekStart, metric: r.metric as WeekMetric, plan: r.plan }));
}

/** A number = set the week's plan by hand; null = back to the automatic split. */
export async function saveWeekOverride(projectId: string, weekStart: string, values: Partial<Record<WeekMetric, number | null>>, actor: string) {
  const db = getDb();
  for (const [metric, plan] of Object.entries(values)) {
    if (plan === null || plan === undefined) {
      await db
        .delete(projectWeekPlans)
        .where(and(eq(projectWeekPlans.projectId, projectId), eq(projectWeekPlans.weekStart, weekStart), eq(projectWeekPlans.metric, metric)));
      continue;
    }
    await db
      .insert(projectWeekPlans)
      .values({ projectId, weekStart, metric, plan, manual: true, updatedBy: actor })
      .onConflictDoUpdate({
        target: [projectWeekPlans.projectId, projectWeekPlans.weekStart, projectWeekPlans.metric],
        set: { plan, manual: true, updatedAt: new Date(), updatedBy: actor },
      });
  }
  await materializeWeekPlans(projectId);
}

/**
 * Writes the automatic split for the previous, current and next four weeks into project_week_plans,
 * which the AI agent reads (docs/agent-contract.md). Manual rows are left alone.
 */
export async function materializeWeekPlans(projectId: string) {
  const db = getDb();
  const [[project], planRows, overrides] = await Promise.all([
    db.select({ start: projects.periodStart, kpis: projects.kpis, budgetMonth: projects.budgetMonth }).from(projects).where(eq(projects.id, projectId)).limit(1),
    db.select().from(projectPlans).where(eq(projectPlans.projectId, projectId)).orderBy(asc(projectPlans.month)),
    listWeekOverrides(projectId),
  ]);
  if (!project) return;
  const plans: MonthPlan[] = planRows.map((r) => ({ month: r.month, kpis: r.kpis, budgetMonth: r.budgetMonth ?? null }));
  const fallback = plans.length ? null : { kpis: project.kpis ?? [], budgetMonth: project.budgetMonth ?? null };
  const first = addDays(weekStartOf(today()), -7);
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(first, i * 7));

  for (const weekStart of weeks) {
    const plan = weekPlan(plans, overrides, weekStart, monthOf(project.start), fallback);
    const auto = Object.entries(plan).filter(([, v]) => v && !v.manual) as [string, { plan: number }][];
    for (const [metric, v] of auto) {
      await db
        .insert(projectWeekPlans)
        .values({ projectId, weekStart, metric, plan: v.plan, manual: false })
        .onConflictDoUpdate({
          target: [projectWeekPlans.projectId, projectWeekPlans.weekStart, projectWeekPlans.metric],
          set: { plan: v.plan, updatedAt: new Date() },
          setWhere: sql`${projectWeekPlans.manual} = false`,
        });
    }
    // An automatic row whose metric left the plan must not linger.
    const keep = Object.keys(plan);
    await db
      .delete(projectWeekPlans)
      .where(
        and(
          eq(projectWeekPlans.projectId, projectId),
          eq(projectWeekPlans.weekStart, weekStart),
          eq(projectWeekPlans.manual, false),
          keep.length ? notInArray(projectWeekPlans.metric, keep) : sql`true`,
        ),
      );
  }
  // Weeks long gone: keep manual history, drop stale automatic rows.
  await db
    .delete(projectWeekPlans)
    .where(and(eq(projectWeekPlans.projectId, projectId), eq(projectWeekPlans.manual, false), notInArray(projectWeekPlans.weekStart, weeks)));
}

export async function materializeAllWeekPlans() {
  const db = getDb();
  const list = await db.select({ id: projects.id }).from(projects).where(inArray(projects.status, ["active", "paused"]));
  for (const p of list) await materializeWeekPlans(p.id).catch((error) => console.error("week plans failed", p.id, error));
}
