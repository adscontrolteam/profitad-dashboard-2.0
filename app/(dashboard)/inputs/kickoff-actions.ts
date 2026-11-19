"use server";

import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { buildKickoff, splitForTelegram } from "@/lib/ai/kickoff";
import { audit } from "@/lib/audit";
import { getProject } from "@/lib/data";
import { sendTelegram, telegramConfigured } from "@/lib/log/notify";
import { addLog } from "@/lib/log/store";

async function guard(projectId: string) {
  const viewer = await requireSection("inputs");
  return viewer.permissions.canEditInputs && canViewProject(viewer.permissions, projectId) ? viewer : null;
}

/** Draft of the project's kickoff message, for a person to read and edit before it goes to the chat. */
export async function draftKickoffAction(projectId: string): Promise<{ ok: true; text: string; gaps: string[]; withDigest: boolean } | { ok: false; message: string }> {
  if (!(await guard(projectId))) return { ok: false, message: "Нет прав на «Вводные» этого проекта." };
  try {
    const draft = await buildKickoff(projectId);
    return draft ? { ok: true, ...draft } : { ok: false, message: "Проект не найден." };
  } catch (error) {
    return { ok: false, message: `Не удалось собрать сообщение: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Sends the text (as edited by the person) to the project's Telegram chat. */
export async function sendKickoffAction(projectId: string, text: string): Promise<{ ok: boolean; message: string }> {
  const viewer = await guard(projectId);
  if (!viewer) return { ok: false, message: "Нет прав на «Вводные» этого проекта." };
  const body = String(text ?? "").trim();
  if (!body) return { ok: false, message: "Сообщение пустое." };
  if (body.length > 12_000) return { ok: false, message: "Сообщение слишком длинное: сократите до 12 000 знаков." };
  if (!telegramConfigured()) return { ok: false, message: "Telegram не подключён: в Vercel нет TELEGRAM_BOT_TOKEN. Скопируйте текст и отправьте вручную." };
  const project = await getProject(projectId);
  if (!project) return { ok: false, message: "Проект не найден." };
  const chat = project.agent.telegramChatId;
  if (!chat) return { ok: false, message: "У проекта не указан Telegram-чат: «Вводные» → проект → «Telegram-чат проекта»." };
  const parts = splitForTelegram(body);
  try {
    for (const part of parts) await sendTelegram(chat, project.agent.telegramThreadId, part);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await audit({ actorEmail: viewer.email, action: "project.kickoff", projectId, ok: false, result: message });
    return { ok: false, message: `Не отправилось: ${message}` };
  }
  await audit({ actorEmail: viewer.email, action: "project.kickoff", projectId, ok: true, result: `сообщений: ${parts.length}` });
  await addLog(projectId, { kind: "info", status: "done", area: "project", topic: "kickoff", title: "Стартовое сообщение отправлено в чат проекта", body: `Отправил ${viewer.email}.` }).catch(() => undefined);
  return { ok: true, message: parts.length > 1 ? `Отправлено в чат, ${parts.length} сообщениями.` : "Отправлено в чат." };
}
