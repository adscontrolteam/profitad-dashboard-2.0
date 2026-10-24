import { and, asc, count, eq, inArray, isNotNull, isNull, lt, max, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { taskComments, tasks, type TaskCommentRow, type TaskRow } from "@/db/schema";
import type { Task, TaskComment, TaskStage } from "./stages";

export type TaskInput = Pick<Task, "title" | "description" | "projectId" | "assigneeEmail" | "deadline" | "stage">;

function toTask(row: TaskRow, commentCount: number): Task {
  return {
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    stageChangedAt: row.stageChangedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    commentCount,
  };
}

function toComment(row: TaskCommentRow): TaskComment {
  return {
    id: row.id,
    authorEmail: row.authorEmail,
    authorName: row.authorName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

async function commentCounts(ids: string[]) {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await getDb()
    .select({ taskId: taskComments.taskId, value: count() })
    .from(taskComments)
    .where(inArray(taskComments.taskId, ids))
    .groupBy(taskComments.taskId);
  return new Map(rows.map((r) => [r.taskId, r.value]));
}

/** Board tasks (archived = false) or the archive (archived = true). */
export async function listTasks({ archived }: { archived: boolean }): Promise<Task[]> {
  const rows = await getDb()
    .select()
    .from(tasks)
    .where(archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt))
    .orderBy(archived ? desc(tasks.archivedAt) : asc(tasks.position));
  const counts = await commentCounts(rows.map((r) => r.id));
  return rows.map((r) => toTask(r, counts.get(r.id) ?? 0));
}

export async function getTask(id: string) {
  const [row] = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row ?? null;
}

async function nextPosition(stage: TaskStage) {
  const [row] = await getDb()
    .select({ value: max(tasks.position) })
    .from(tasks)
    .where(and(eq(tasks.stage, stage), isNull(tasks.archivedAt)));
  return (row?.value ?? 0) + 1;
}

export async function createTask(input: TaskInput, actorEmail: string) {
  const id = crypto.randomUUID();
  await getDb()
    .insert(tasks)
    .values({
      ...input,
      id,
      position: await nextPosition(input.stage),
      createdBy: actorEmail,
      updatedBy: actorEmail,
    });
  return id;
}

export async function updateTask(id: string, input: TaskInput, actorEmail: string) {
  const current = await getTask(id);
  if (!current) return false;

  const stageChanged = current.stage !== input.stage;
  await getDb()
    .update(tasks)
    .set({
      ...input,
      ...(stageChanged && { position: await nextPosition(input.stage), stageChangedAt: new Date() }),
      updatedAt: new Date(),
      updatedBy: actorEmail,
    })
    .where(eq(tasks.id, id));
  return true;
}

export async function moveTask(id: string, stage: TaskStage, position: number, actorEmail: string) {
  const current = await getTask(id);
  if (!current) return false;

  await getDb()
    .update(tasks)
    .set({
      stage,
      position,
      ...(current.stage !== stage && { stageChangedAt: new Date() }),
      updatedAt: new Date(),
      updatedBy: actorEmail,
    })
    .where(eq(tasks.id, id));
  return true;
}

export async function archiveTasks(ids: string[], actorEmail: string) {
  if (ids.length === 0) return;
  await getDb()
    .update(tasks)
    .set({ archivedAt: new Date(), archivedBy: actorEmail })
    .where(and(inArray(tasks.id, ids), isNull(tasks.archivedAt)));
}

export async function restoreTasks(ids: string[], actorEmail: string) {
  if (ids.length === 0) return;
  await getDb()
    .update(tasks)
    .set({ archivedAt: null, archivedBy: null, updatedAt: new Date(), updatedBy: actorEmail })
    .where(inArray(tasks.id, ids));
}

/**
 * Called when a project is archived: every task created before that moment goes to the archive.
 * Tasks added to the project afterwards stay on the board.
 */
export async function archiveProjectTasks(projectId: string, actorEmail: string, at = new Date()) {
  await getDb()
    .update(tasks)
    .set({ archivedAt: at, archivedBy: actorEmail })
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.archivedAt), lt(tasks.createdAt, at)));
}

export async function deleteTask(id: string) {
  await getDb().delete(tasks).where(eq(tasks.id, id));
}

export async function listComments(taskId: string): Promise<TaskComment[]> {
  const rows = await getDb()
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt));
  return rows.map(toComment);
}

export async function addComment(taskId: string, body: string, author: { email: string; name: string | null }) {
  await getDb().insert(taskComments).values({
    id: crypto.randomUUID(),
    taskId,
    body,
    authorEmail: author.email,
    authorName: author.name,
  });
}

export async function getComment(id: string) {
  const [row] = await getDb().select().from(taskComments).where(eq(taskComments.id, id)).limit(1);
  return row ?? null;
}

export async function deleteComment(id: string) {
  await getDb().delete(taskComments).where(eq(taskComments.id, id));
}
