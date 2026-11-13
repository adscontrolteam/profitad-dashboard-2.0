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
  type ProjectOwners,
  type ProjectStatus,
  type ResultMetric,
  type TrafficPlatform,
} from "@/lib/domain/types";
import { createProject, deleteProject, getProjectStatus, updateProject, type ProjectInput } from "@/lib/projects/store";
import { getProject } from "@/lib/data";
import { listOwnerCandidates } from "@/lib/projects/owners";
import { archiveProjectTasks } from "@/lib/tasks/store";
import { audit } from "@/lib/audit";
import { ensureProjectFolder, ensureReport } from "@/lib/integrations/provision";

export interface ProjectActionState {
  ok: boolean;
  message: string | null;
  /** Saved, but something to read before closing (e.g. Drive/report creation failed). */
  warning?: string | null;
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
    owners: {
      smm: str(data.smmEmail, 200).toLowerCase() || null,
      mediaBuyer: str(data.mediaBuyerEmail, 200).toLowerCase() || null,
    },
    agent: {
      leadActions: (Array.isArray(data.leadActions) ? data.leadActions : [])
        .map((a) => str(a, 200))
        .filter(Boolean)
        .slice(0, 30),
      currency: /^[A-Z]{3}$/.test(str(data.currency, 3).toUpperCase()) ? str(data.currency, 3).toUpperCase() : null,
      budgetMonth: positive(data.budgetMonth),
      dailyReport: data.agentDailyReport !== false,
    },
  };
}

/** Owners must have the matching role (or be admins); an unchanged previous owner is kept as is. */
async function checkOwners(input: ProjectInput, previous: ProjectOwners | null): Promise<string | null> {
  const candidates = await listOwnerCandidates();
  const ok = (email: string | null, list: { email: string }[], prev: string | null | undefined) =>
    email === null || email === prev || list.some((c) => c.email === email);
  if (!ok(input.owners.smm, candidates.smm, previous?.smm)) return "Ответственный SMM должен иметь роль SMM.";
  if (!ok(input.owners.mediaBuyer, candidates.mediaBuyer, previous?.mediaBuyer)) {
    return "Ответственный MediaBuyer должен иметь роль MediaBuyer.";
  }
  return null;
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
  const ownersError = await checkOwners(input, id ? ((await getProject(id))?.owners ?? null) : null);
  if (ownersError) return { ok: false, message: ownersError };

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
    const newId = await createProject(input, viewer.email);
    const flags = raw as { createDrive?: unknown; createReport?: unknown };
    const warning = await provision(newId, input.name, viewer.email, Boolean(flags.createDrive), Boolean(flags.createReport));
    updateTag(TAGS.projects);
    return { ok: true, message: "Проект добавлен.", warning };
  }

  updateTag(TAGS.projects);
  return { ok: true, message: "Проект сохранён." };
}

export async function deleteProjectAction(id: string): Promise<ProjectActionState> {
  const viewer = await requireSection("inputs");
  if (!viewer.permissions.canManageAccess) return { ok: false, message: "Удалять проекты могут Admin и Project Manager." };
  await deleteProject(id);
  updateTag(TAGS.projects);
  return { ok: true, message: "Проект удалён." };
}

/** Creates the project's Drive folder and/or «Репорт» from the templates. Returns a warning text on failure. */
async function provision(projectId: string, name: string, actorEmail: string, drive: boolean, report: boolean) {
  if (!drive && !report) return null;
  try {
    if (report) await ensureReport(projectId, name, actorEmail);
    else await ensureProjectFolder(projectId, name, actorEmail);
    await audit({ actorEmail, action: "project.provision", projectId, ok: true, result: report ? "папка и Репорт" : "папка" });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await audit({ actorEmail, action: "project.provision", projectId, ok: false, result: message });
    return `Проект добавлен, но ${report ? "папку и Репорт" : "папку"} создать не удалось: ${message} Повторить можно в карточке проекта → Подключения.`;
  }
}

/** Conversion actions of a Google Ads account, to choose what counts as a lead. */
export async function listConversionActionsAction(accountId: string): Promise<{ ok: boolean; actions: string[]; message?: string }> {
  await requireSection("inputs");
  const id = accountId.replace(/\D/g, "");
  if (!id) return { ok: false, actions: [] };
  try {
    const { adsConfigured, conversionActions } = await import("@/lib/google/ads");
    if (!adsConfigured()) return { ok: false, actions: [], message: "Google Ads API не настроен." };
    return { ok: true, actions: (await conversionActions(id)).map((a) => a.name) };
  } catch (error) {
    return { ok: false, actions: [], message: error instanceof Error ? error.message : "Ошибка Google Ads" };
  }
}

export interface BriefActionResult {
  ok: boolean;
  message?: string;
  analysis?: import("@/lib/ai/conductor").BriefAnalysis;
}

/** «Дирижёр»: free-form brief → project passport, card fields and follow-up questions. Nothing is saved here. */
export async function analyzeBriefAction(input: {
  projectName: string;
  brief: string;
  answers: { question: string; answer: string }[];
  current: { goal: string; currency: string | null; budgetMonth: number | null; leadActions: string[] };
}): Promise<BriefActionResult> {
  const viewer = await requireSection("inputs");
  if (!viewer.permissions.canEditInputs) return { ok: false, message: "Нет прав на редактирование «Вводных»." };
  const brief = String(input.brief ?? "").slice(0, 30000);
  if (brief.trim().length < 20) return { ok: false, message: "Вставьте бриф — хотя бы пару предложений." };
  const { analyzeBrief, conductorConfigured } = await import("@/lib/ai/conductor");
  if (!conductorConfigured()) return { ok: false, message: "Дирижёр не настроен: нужен ANTHROPIC_API_KEY." };
  try {
    const analysis = await analyzeBrief({
      projectName: String(input.projectName ?? "").slice(0, 120),
      brief,
      answers: (input.answers ?? []).slice(0, 20).map((a) => ({ question: String(a.question).slice(0, 500), answer: String(a.answer).slice(0, 2000) })),
      current: input.current,
    });
    return { ok: true, analysis };
  } catch (error) {
    const text = error instanceof Error ? error.message : "Ошибка Дирижёра";
    if (/credit balance/i.test(text)) return { ok: false, message: "На балансе Anthropic API закончились кредиты — пополните в console.anthropic.com → Billing." };
    if (/authentication|invalid x-api-key/i.test(text)) return { ok: false, message: "Ключ ANTHROPIC_API_KEY не принят Anthropic." };
    return { ok: false, message: text };
  }
}
