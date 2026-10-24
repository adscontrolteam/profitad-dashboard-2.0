import type { StatusTone } from "@/lib/domain/statuses";

/** Board order. Add or rename stages here; the board, forms and stats follow. */
export const TASK_STAGES = ["backlog", "todo", "in_progress", "review", "done"] as const;
export type TaskStage = (typeof TASK_STAGES)[number];

export const TASK_STAGE_META: Record<TaskStage, { label: string; tone: StatusTone }> = {
  backlog: { label: "Бэклог", tone: "gray" },
  todo: { label: "To do", tone: "blue" },
  in_progress: { label: "В работе", tone: "amber" },
  review: { label: "Review", tone: "blue" },
  done: { label: "Выполнено", tone: "green" },
};

export const isTaskStage = (value: unknown): value is TaskStage => TASK_STAGES.includes(value as TaskStage);

export interface TaskComment {
  id: string;
  authorEmail: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  assigneeEmail: string | null;
  /** YYYY-MM-DD */
  deadline: string | null;
  stage: TaskStage;
  /** Order inside a stage column. */
  position: number;
  archivedAt: string | null;
  archivedBy: string | null;
  stageChangedAt: string;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  commentCount: number;
}

/** Someone a task can be assigned to: an admin or a user with a grant. */
export interface TeamMember {
  email: string;
  name: string | null;
  imageUrl: string | null;
}

export interface TaskSummary {
  open: number;
  inProgress: number;
  overdue: number;
  mine: number;
}

export const isOverdue = (task: Pick<Task, "deadline" | "stage">, today: string) =>
  Boolean(task.deadline && task.deadline < today && task.stage !== "done");

export function summarizeTasks(tasks: Task[], today: string, viewerEmail: string): TaskSummary {
  const open = tasks.filter((t) => t.stage !== "done");
  return {
    open: open.length,
    inProgress: tasks.filter((t) => t.stage === "in_progress").length,
    overdue: open.filter((t) => isOverdue(t, today)).length,
    mine: open.filter((t) => t.assigneeEmail === viewerEmail).length,
  };
}
