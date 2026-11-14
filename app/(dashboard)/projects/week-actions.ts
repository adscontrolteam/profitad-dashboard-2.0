"use server";

import { revalidateTag } from "next/cache";
import { canViewProject } from "@/lib/access/policy";
import { requireViewer } from "@/lib/access/viewer";
import { TAGS } from "@/lib/data/tags";
import { RESULT_METRICS } from "@/lib/domain/types";
import { saveWeekOverride } from "@/lib/projects/week-store";
import { weekStartOf, type WeekMetric } from "@/lib/projects/weeks";

const METRICS: readonly string[] = [...RESULT_METRICS, "spend"];

/**
 * Sets the plan of a row of the week table by hand; a null value returns that number to the automatic split.
 * A row is one calendar week, or two when a short edge of the month joined its neighbour: the number entered is for
 * all `days` of the row, and each calendar week stores it as its own seven-day plan at the same daily rate.
 */
export async function saveWeekPlanAction(
  projectId: string,
  weekStarts: string[],
  days: number,
  values: Record<string, number | null>,
): Promise<{ ok: boolean; message: string }> {
  const viewer = await requireViewer();
  if (!viewer.permissions.canEditInputs || !canViewProject(viewer.permissions, projectId)) {
    return { ok: false, message: "План недели меняет администратор." };
  }
  if (!Array.isArray(weekStarts) || weekStarts.length < 1 || weekStarts.length > 2 || !(days >= 4 && days <= 10)) return { ok: false, message: "Неверная неделя." };
  for (const weekStart of weekStarts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekStartOf(weekStart) !== weekStart) return { ok: false, message: "Неделя должна начинаться с понедельника." };
  }
  const clean: Partial<Record<WeekMetric, number | null>> = {};
  for (const [metric, value] of Object.entries(values)) {
    if (!METRICS.includes(metric)) continue;
    if (value !== null && (!Number.isFinite(value) || value < 0)) return { ok: false, message: "План — число не меньше нуля." };
    clean[metric as WeekMetric] = value === null ? null : (value * 7) / days;
  }
  for (const weekStart of weekStarts) await saveWeekOverride(projectId, weekStart, clean, viewer.email);
  revalidateTag(TAGS.project(projectId), "max");
  return { ok: true, message: "Сохранено." };
}
