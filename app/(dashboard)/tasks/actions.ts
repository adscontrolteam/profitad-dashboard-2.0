"use server";

import { refresh } from "next/cache";
import { canViewProject, isValidEmail, normalizeEmail } from "@/lib/access/policy";
import { requireSection, type Viewer } from "@/lib/access/viewer";
import { isTaskStage, type TaskComment } from "@/lib/tasks/stages";
import {
  addComment,
  archiveTasks,
  createTask,
  deleteComment,
  deleteTask,
  getComment,
  getTask,
  listComments,
  moveTask,
  restoreTasks,
  updateTask,
  type TaskInput,
} from "@/lib/tasks/store";

export interface TaskActionState {
  ok: boolean;
  message: string | null;
}

const MAX_BULK = 500;

const text = (formData: FormData, key: string, maxLength = 500) =>
  String(formData.get(key) ?? "").trim().slice(0, maxLength);

/** Viewers limited to some projects only see tasks of those projects and tasks without a project. */
const canTouchProject = (viewer: Viewer, projectId: string | null) =>
  projectId === null || canViewProject(viewer.permissions, projectId);

async function visibleTaskIds(viewer: Viewer, ids: unknown) {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string"))].slice(0, MAX_BULK);
  if (viewer.permissions.projects === "all") return unique;
  const rows = await Promise.all(unique.map((id) => getTask(id)));
  return rows.filter((row) => row && canTouchProject(viewer, row.projectId)).map((row) => row!.id);
}

function parseTask(formData: FormData): TaskInput | string {
  const title = text(formData, "title", 160);
  if (!title) return "Укажите название задачи.";

  const stage = formData.get("stage");
  if (!isTaskStage(stage)) return "Выберите этап.";

  const deadline = text(formData, "deadline", 10);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return "Некорректный дедлайн.";

  const assignee = normalizeEmail(text(formData, "assigneeEmail", 200));
  if (assignee && !isValidEmail(assignee)) return "Некорректный исполнитель.";

  return {
    title,
    stage,
    description: text(formData, "description", 10_000),
    projectId: text(formData, "projectId", 64) || null,
    assigneeEmail: assignee || null,
    deadline: deadline || null,
  };
}

export async function saveTaskAction(_prev: TaskActionState, formData: FormData): Promise<TaskActionState> {
  const viewer = await requireSection("tasks");
  const input = parseTask(formData);
  if (typeof input === "string") return { ok: false, message: input };
  if (!canTouchProject(viewer, input.projectId)) return { ok: false, message: "Нет доступа к проекту." };

  const id = text(formData, "id", 64);
  if (id) {
    const current = await getTask(id);
    if (!current || !canTouchProject(viewer, current.projectId)) return { ok: false, message: "Задача не найдена." };
    await updateTask(id, input, viewer.email);
  } else {
    await createTask(input, viewer.email);
  }

  refresh();
  return { ok: true, message: id ? "Задача сохранена." : "Задача добавлена." };
}

export async function moveTaskAction(id: string, stage: string, position: number) {
  const viewer = await requireSection("tasks");
  if (!isTaskStage(stage) || !Number.isFinite(position)) return;
  const current = await getTask(id);
  if (!current || !canTouchProject(viewer, current.projectId)) return;
  await moveTask(id, stage, position, viewer.email);
  refresh();
}

export async function archiveTasksAction(ids: string[]): Promise<TaskActionState> {
  const viewer = await requireSection("tasks");
  const allowed = await visibleTaskIds(viewer, ids);
  await archiveTasks(allowed, viewer.email);
  refresh();
  return { ok: true, message: `В архив: ${allowed.length}` };
}

export async function restoreTasksAction(ids: string[]): Promise<TaskActionState> {
  const viewer = await requireSection("tasks");
  const allowed = await visibleTaskIds(viewer, ids);
  await restoreTasks(allowed, viewer.email);
  refresh();
  return { ok: true, message: `Восстановлено: ${allowed.length}` };
}

export async function deleteTaskAction(id: string): Promise<TaskActionState> {
  const viewer = await requireSection("tasks");
  const current = await getTask(id);
  if (!current || !canTouchProject(viewer, current.projectId)) return { ok: false, message: "Задача не найдена." };
  await deleteTask(id);
  refresh();
  return { ok: true, message: "Задача удалена." };
}

export async function loadCommentsAction(taskId: string): Promise<TaskComment[]> {
  const viewer = await requireSection("tasks");
  const task = await getTask(taskId);
  if (!task || !canTouchProject(viewer, task.projectId)) return [];
  return listComments(taskId);
}

export async function addCommentAction(taskId: string, body: string): Promise<TaskComment[] | string> {
  const viewer = await requireSection("tasks");
  const trimmed = String(body ?? "").trim().slice(0, 5000);
  if (!trimmed) return "Комментарий пустой.";
  const task = await getTask(taskId);
  if (!task || !canTouchProject(viewer, task.projectId)) return "Задача не найдена.";

  await addComment(taskId, trimmed, { email: viewer.email, name: viewer.name });
  refresh();
  return listComments(taskId);
}

/** Authors remove their own comments; Admin and Project Manager can remove any. */
export async function deleteCommentAction(commentId: string): Promise<TaskComment[] | string> {
  const viewer = await requireSection("tasks");
  const comment = await getComment(commentId);
  if (!comment) return "Комментарий не найден.";
  if (comment.authorEmail !== viewer.email && !viewer.permissions.canManageAccess) {
    return "Можно удалять только свои комментарии.";
  }
  await deleteComment(commentId);
  refresh();
  return listComments(comment.taskId);
}
