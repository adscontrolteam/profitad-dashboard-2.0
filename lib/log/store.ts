import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projectLog, type ProjectLogRow } from "@/db/schema";

export type LogStatus = ProjectLogRow["status"];
export type LogKind = "proposal" | "analysis" | "error" | "warning" | "info";
export type LogArea = "ads" | "smm" | "project";
export type LogFocus = "scale" | "stop" | "fix" | "decide";

export interface LogEntry {
  title: string;
  body?: string;
  kind: LogKind;
  link?: string | null;
  area?: LogArea;
  /** «Фокус»: the entry is an action to take now. See project_log.focus. */
  focus?: LogFocus | null;
  /** Price of doing nothing for a week, in the project's currency. */
  impact?: number | null;
  effortMin?: number | null;
  rollback?: string | null;
}

export async function addLog(projectId: string, entry: LogEntry & { status: LogStatus; source?: "dashboard" | "agent"; topic?: string | null }) {
  await getDb()
    .insert(projectLog)
    .values({
      id: crypto.randomUUID(),
      projectId,
      source: entry.source ?? "dashboard",
      area: entry.area ?? "project",
      kind: entry.kind,
      title: entry.title.slice(0, 300),
      body: (entry.body ?? "").slice(0, 4000),
      status: entry.status,
      topic: entry.topic ?? null,
      link: entry.link ?? null,
      focus: entry.focus ?? null,
      impact: entry.impact ?? null,
      effortMin: entry.effortMin ?? null,
      rollback: entry.rollback ?? null,
    });
}

/**
 * A recurring check («the sheet sync fails», «no plan for this month»): while `active`, one open entry waiting for a
 * person is kept up to date; once the condition clears, that entry is closed as resolved automatically.
 */
export async function condition(projectId: string, topic: string, active: boolean, entry: LogEntry, resolvedText = "Решилось само") {
  const db = getDb();
  const [open] = await db
    .select()
    .from(projectLog)
    .where(and(eq(projectLog.projectId, projectId), eq(projectLog.topic, topic), eq(projectLog.status, "needs_you")))
    .orderBy(desc(projectLog.createdAt))
    .limit(1);
  if (active) {
    if (!open) return addLog(projectId, { ...entry, status: "needs_you", topic });
    const focusChanged = (entry.focus ?? null) !== open.focus || (entry.impact ?? null) !== open.impact;
    if (open.title !== entry.title || open.body !== (entry.body ?? "") || focusChanged) {
      await db
        .update(projectLog)
        .set({
          title: entry.title.slice(0, 300),
          body: (entry.body ?? "").slice(0, 4000),
          link: entry.link ?? open.link,
          area: entry.area ?? open.area,
          focus: entry.focus ?? null,
          impact: entry.impact ?? null,
          effortMin: entry.effortMin ?? null,
          rollback: entry.rollback ?? null,
          updatedAt: new Date(),
        })
        .where(eq(projectLog.id, open.id));
    }
    return;
  }
  if (open) {
    await db
      .update(projectLog)
      .set({ status: "auto", resolvedAt: new Date(), resolvedBy: "дашборд", resolutionNote: resolvedText, updatedAt: new Date() })
      .where(eq(projectLog.id, open.id));
  }
}

/** `area` = only that log (Реклама / SMM); without it — everything, for the project page. */
export async function listLog(projectId: string, area?: LogArea, limit = 100) {
  const where = area ? and(eq(projectLog.projectId, projectId), eq(projectLog.area, area)) : eq(projectLog.projectId, projectId);
  return getDb().select().from(projectLog).where(where).orderBy(desc(projectLog.updatedAt)).limit(limit);
}

/** Open «Фокус» entries of several projects, the costliest first — for the dashboard's «куда дать внимание». */
export async function listFocus(projectIds: string[], limit = 12) {
  if (projectIds.length === 0) return [];
  return getDb()
    .select()
    .from(projectLog)
    .where(and(inArray(projectLog.projectId, projectIds), eq(projectLog.status, "needs_you"), sql`${projectLog.focus} is not null`))
    .orderBy(sql`${projectLog.impact} desc nulls last`, desc(projectLog.updatedAt))
    .limit(limit);
}

export async function logCounts(projectId: string) {
  const rows = await getDb()
    .select({ status: projectLog.status, n: sql<number>`count(*)` })
    .from(projectLog)
    .where(eq(projectLog.projectId, projectId))
    .groupBy(projectLog.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return { needs_you: by.needs_you ?? 0, auto: by.auto ?? 0, done: by.done ?? 0 };
}

export async function resolveLog(projectId: string, id: string, by: string, note: string) {
  const rows = await getDb()
    .update(projectLog)
    .set({ status: "done", resolvedBy: by, resolvedAt: new Date(), resolutionNote: note.slice(0, 2000) || null, updatedAt: new Date() })
    .where(and(eq(projectLog.id, id), eq(projectLog.projectId, projectId), inArray(projectLog.status, ["needs_you"])))
    .returning({ id: projectLog.id });
  return rows.length > 0;
}
