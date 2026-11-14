import { asc, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, projectPlans, projects } from "@/db/schema";
import type { MonthPlan, Project } from "@/lib/domain/types";
import { currentMonth, monthOf, planFor } from "./plans";

export type ProjectInput = Omit<Project, "id" | "metrics" | "period" | "kpis" | "plans" | "planCarried"> & {
  /** The month plan edited in the form; saved into project_plans. */
  plan: MonthPlan;
};

function toRow(input: ProjectInput) {
  return {
    name: input.name,
    status: input.status,
    goal: input.goal,
    periodStart: input.startDate,
    sources: input.sources,
    notes: input.notes,
    smmEmail: input.owners.smm,
    mediaBuyerEmail: input.owners.mediaBuyer,
    leadActions: input.agent.leadActions,
    metaActions: input.agent.metaActions,
    currency: input.agent.currency,
    agentDailyReport: input.agent.dailyReport,
  };
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueId(name: string) {
  const base = slugify(name) || "project";
  const [taken] = await getDb().select({ id: projects.id }).from(projects).where(eq(projects.id, base)).limit(1);
  return taken ? `${base}-${crypto.randomUUID().slice(0, 4)}` : base;
}

export async function createProject(input: ProjectInput, actorEmail: string) {
  const db = getDb();
  const [last] = await db.select({ value: max(projects.position) }).from(projects);
  const id = await uniqueId(input.name);
  await db.insert(projects).values({
    ...toRow(input),
    id,
    position: (last?.value ?? 0) + 1,
    updatedBy: actorEmail,
  });
  await savePlan(id, input.plan, actorEmail);
  return id;
}

export async function getProjectStatus(id: string) {
  const [row] = await getDb().select({ status: projects.status }).from(projects).where(eq(projects.id, id)).limit(1);
  return row?.status ?? null;
}

export async function updateProject(id: string, input: ProjectInput, actorEmail: string) {
  const rows = await getDb()
    .update(projects)
    .set({ ...toRow(input), updatedAt: new Date(), updatedBy: actorEmail })
    .where(eq(projects.id, id))
    .returning({ id: projects.id });
  if (!rows.length) return false;
  await savePlan(id, input.plan, actorEmail);
  return true;
}

/**
 * Saves one month's plan and mirrors the plan now in force into projects.kpis / budget_month,
 * which the AI agent reads (docs/agent-contract.md).
 */
export async function savePlan(projectId: string, plan: MonthPlan, actorEmail: string) {
  const db = getDb();
  await db
    .insert(projectPlans)
    .values({ projectId, month: plan.month, kpis: plan.kpis, budgetMonth: plan.budgetMonth, updatedBy: actorEmail })
    .onConflictDoUpdate({
      target: [projectPlans.projectId, projectPlans.month],
      set: { kpis: sql`excluded.kpis`, budgetMonth: sql`excluded.budget_month`, updatedAt: new Date(), updatedBy: actorEmail },
    });
  await syncCurrentPlan(projectId);
}

/** projects.kpis / budget_month = the plan in force this month (run on save and when a month starts). */
export async function syncCurrentPlan(projectId: string) {
  const db = getDb();
  const [[row], rows] = await Promise.all([
    db.select({ start: projects.periodStart }).from(projects).where(eq(projects.id, projectId)).limit(1),
    db.select().from(projectPlans).where(eq(projectPlans.projectId, projectId)).orderBy(asc(projectPlans.month)),
  ]);
  if (!row) return;
  const plans = rows.map((r) => ({ month: r.month, kpis: r.kpis, budgetMonth: r.budgetMonth ?? null }));
  // Before the start of work the first plan is the one to show.
  const month = currentMonth() < monthOf(row.start) ? monthOf(row.start) : currentMonth();
  const now = planFor(plans, month, monthOf(row.start), null) ?? plans[0];
  if (!now) return;
  await db.update(projects).set({ kpis: now.kpis, budgetMonth: now.budgetMonth }).where(eq(projects.id, projectId));
}

export async function deleteProject(id: string) {
  const db = getDb();
  await db.delete(adMetricsDaily).where(eq(adMetricsDaily.projectId, id));
  await db.delete(projectPlans).where(eq(projectPlans.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}
