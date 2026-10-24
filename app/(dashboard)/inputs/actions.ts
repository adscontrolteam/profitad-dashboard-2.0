"use server";

import { updateTag } from "next/cache";
import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { TAGS } from "@/lib/data/tags";
import {
  PROJECT_STATUSES,
  RESULT_METRICS,
  TRAFFIC_PLATFORMS,
  type Kpi,
  type ProjectStatus,
  type ResultMetric,
  type TrafficPlatform,
} from "@/lib/domain/types";
import { createProject, deleteProject, getProjectStatus, updateProject, type ProjectInput } from "@/lib/projects/store";
import { archiveProjectTasks } from "@/lib/tasks/store";

export interface ProjectActionState {
  ok: boolean;
  message: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const str = (value: unknown, maxLength: number) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

function positive(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[\s,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseProject(raw: unknown): ProjectInput | string {
  if (!raw || typeof raw !== "object") return "Некорректные данные формы.";
  const data = raw as Record<string, unknown>;

  const name = str(data.name, 80);
  if (!name) return "Укажите название проекта.";

  const status = data.status as ProjectStatus;
  if (!PROJECT_STATUSES.includes(status)) return "Выберите статус.";

  const start = str(data.periodStart, 10);
  const end = str(data.periodEnd, 10);
  if (!DATE.test(start) || !DATE.test(end)) return "Укажите период.";
  if (start > end) return "Начало периода позже конца.";

  const kpis: Kpi[] = [];
  for (const item of Array.isArray(data.kpis) ? data.kpis.slice(0, 6) : []) {
    const metric = (item as Record<string, unknown>)?.metric as ResultMetric;
    if (!RESULT_METRICS.includes(metric)) return "Выберите метрику результата.";
    if (kpis.some((k) => k.metric === metric)) return "Один и тот же результат указан дважды.";
    const k = item as Record<string, unknown>;
    kpis.push({ metric, plan: positive(k.plan), cpaPlan: positive(k.cpaPlan) });
  }

  const sources = [];
  for (const item of Array.isArray(data.sources) ? data.sources.slice(0, 10) : []) {
    const s = item as Record<string, unknown>;
    const platform = s?.platform as TrafficPlatform;
    if (!TRAFFIC_PLATFORMS.includes(platform)) return "Выберите площадку.";
    sources.push({ platform, accountId: str(s.accountId, 40).replace(/^act_/, "") });
  }

  return {
    name,
    status,
    goal: str(data.goal, 200),
    period: { start, end },
    kpis,
    sources,
    notes: str(data.notes, 5000),
  };
}

export async function saveProjectAction(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const viewer = await requireSection("inputs");
  if (!viewer.permissions.canEditInputs) return { ok: false, message: "Нет прав на редактирование «Вводных»." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, message: "Некорректные данные формы." };
  }
  const input = parseProject(raw);
  if (typeof input === "string") return { ok: false, message: input };

  const id = str((raw as Record<string, unknown>).id, 64);
  if (id) {
    if (!canViewProject(viewer.permissions, id)) return { ok: false, message: "Нет доступа к проекту." };
    const previousStatus = await getProjectStatus(id);
    if (!(await updateProject(id, input, viewer.email))) return { ok: false, message: "Проект не найден." };
    // Archiving a project archives every task set for it so far; tasks added later stay on the board.
    if (input.status === "archived" && previousStatus !== "archived") {
      await archiveProjectTasks(id, viewer.email);
    }
  } else {
    if (viewer.permissions.projects !== "all") {
      return { ok: false, message: "Создавать проекты может только пользователь с доступом ко всем проектам." };
    }
    await createProject(input, viewer.email);
  }

  updateTag(TAGS.projects);
  return { ok: true, message: id ? "Проект сохранён." : "Проект добавлен." };
}

export async function deleteProjectAction(id: string): Promise<ProjectActionState> {
  const viewer = await requireSection("inputs");
  if (!viewer.permissions.canManageAccess) return { ok: false, message: "Удалять проекты могут Admin и Project Manager." };
  await deleteProject(id);
  updateTag(TAGS.projects);
  return { ok: true, message: "Проект удалён." };
}
