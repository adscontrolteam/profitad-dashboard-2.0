"use server";

import { addBriefFile, briefProgress, getBriefByToken, markSubmitted, saveAnswers } from "@/lib/brief/store";
import { addLog } from "@/lib/log/store";

/**
 * Actions of the public brief page. The secret link is the only credential: every call re-reads the brief by token,
 * a closed brief accepts nothing, and only answers to known questions are written.
 */
export async function saveBriefAnswersAction(token: string, answers: Record<string, string>): Promise<{ ok: boolean }> {
  const found = await getBriefByToken(String(token));
  if (!found || found.brief.status === "closed") return { ok: false };
  // The client page never sends hidden questions; drop them anyway.
  const allowed = Object.fromEntries(Object.entries(answers ?? {}).filter(([id]) => !found.brief.hidden.includes(id)));
  await saveAnswers(found.brief.projectId, allowed);
  return { ok: true };
}

export async function submitBriefAction(token: string): Promise<{ ok: boolean }> {
  const found = await getBriefByToken(String(token));
  if (!found || found.brief.status === "closed") return { ok: false };
  const first = found.brief.status !== "submitted";
  await markSubmitted(found.brief.projectId);
  if (first) {
    const p = briefProgress(found.brief);
    await addLog(found.brief.projectId, {
      kind: "info",
      status: "needs_you",
      area: "project",
      title: "Клиент заполнил бриф",
      body: `Отвечено ${p.done} из ${p.total} вопросов. Посмотрите ответы и передайте их Дирижёру во «Вводных».`,
      link: `/inputs/brief/${found.brief.projectId}`,
    }).catch(() => undefined);
  }
  return { ok: true };
}

export async function briefFileUploadedAction(token: string, name: string): Promise<{ ok: boolean }> {
  const found = await getBriefByToken(String(token));
  if (!found || found.brief.status === "closed") return { ok: false };
  await addBriefFile(found.brief.projectId, String(name));
  return { ok: true };
}
