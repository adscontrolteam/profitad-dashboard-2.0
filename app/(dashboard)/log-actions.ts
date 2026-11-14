"use server";

import { canViewProject } from "@/lib/access/policy";
import { requireViewer } from "@/lib/access/viewer";
import { resolveLog } from "@/lib/log/store";

/** Closes a log entry that waited for a person, with an optional comment. */
export async function resolveLogAction(projectId: string, id: string, note: string): Promise<{ ok: boolean; message: string }> {
  const viewer = await requireViewer();
  if (!canViewProject(viewer.permissions, projectId)) return { ok: false, message: "Нет доступа к проекту." };
  const ok = await resolveLog(projectId, id, viewer.email, String(note ?? "").trim());
  return ok ? { ok: true, message: "Отмечено как решённое." } : { ok: false, message: "Запись уже закрыта." };
}
