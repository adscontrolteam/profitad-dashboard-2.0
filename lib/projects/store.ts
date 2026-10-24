import { eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, projects } from "@/db/schema";
import type { Project } from "@/lib/domain/types";

export type ProjectInput = Omit<Project, "id" | "metrics">;

function toRow(input: ProjectInput) {
  return {
    name: input.name,
    status: input.status,
    goal: input.goal,
    periodStart: input.period.start,
    periodEnd: input.period.end,
    kpis: input.kpis,
    sources: input.sources,
    notes: input.notes,
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
  return rows.length > 0;
}

export async function deleteProject(id: string) {
  const db = getDb();
  await db.delete(adMetricsDaily).where(eq(adMetricsDaily.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}
