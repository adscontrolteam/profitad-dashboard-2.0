"use server";

import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { briefAsText, ensureBrief, rotateToken, saveAdmin, saveAnswers } from "@/lib/brief/store";

async function guard(projectId: string) {
  const viewer = await requireSection("inputs");
  return viewer.permissions.canEditInputs && canViewProject(viewer.permissions, projectId);
}

export async function saveBriefAnswersAdminAction(projectId: string, answers: Record<string, string>): Promise<{ ok: boolean }> {
  if (!(await guard(projectId))) return { ok: false };
  await ensureBrief(projectId);
  await saveAnswers(projectId, answers);
  return { ok: true };
}

export async function saveBriefSettingsAction(
  projectId: string,
  input: { notes?: Record<string, string>; hidden?: string[]; lang?: string; status?: string },
): Promise<{ ok: boolean }> {
  if (!(await guard(projectId))) return { ok: false };
  await ensureBrief(projectId);
  await saveAdmin(projectId, input);
  return { ok: true };
}

/** New link; the old one stops working. */
export async function rotateBriefLinkAction(projectId: string): Promise<{ ok: boolean; token?: string }> {
  if (!(await guard(projectId))) return { ok: false };
  await ensureBrief(projectId);
  return { ok: true, token: await rotateToken(projectId) };
}

/** The client's brief as text, to paste into «Дирижёр». */
export async function briefTextAction(projectId: string): Promise<{ ok: boolean; text: string }> {
  if (!(await guard(projectId))) return { ok: false, text: "" };
  return { ok: true, text: briefAsText(await ensureBrief(projectId)) };
}

/** Copies the files and folders linked in the brief into the project's Drive folder and lists the other links there. */
export async function collectBriefLinksAction(projectId: string): Promise<{ ok: boolean; message: string }> {
  if (!(await guard(projectId))) return { ok: false, message: "Нет прав." };
  await ensureBrief(projectId);
  const { collectBriefLinks } = await import("@/lib/brief/links");
  try {
    const report = await collectBriefLinks(projectId);
    return { ok: report.ok, message: report.message };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
