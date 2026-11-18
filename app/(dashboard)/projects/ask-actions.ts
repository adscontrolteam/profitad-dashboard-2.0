"use server";

import Anthropic from "@anthropic-ai/sdk";
import { canViewProject } from "@/lib/access/policy";
import { requireViewer } from "@/lib/access/viewer";
import { askConfigured, askProject, chatUsage, type ChatTurn } from "@/lib/ai/ask";

/** A question about one project; anyone who sees the project may ask. */
export async function askProjectAction(projectId: string, question: string): Promise<{ ok: true; turns: ChatTurn[]; usage: { questions: number; costUsd: number } } | { ok: false; message: string }> {
  const viewer = await requireViewer();
  if (!canViewProject(viewer.permissions, projectId)) return { ok: false, message: "Нет доступа к проекту." };
  if (!askConfigured()) return { ok: false, message: "ИИ не подключён: нет ключа ANTHROPIC_API_KEY." };
  try {
    const turns = await askProject(projectId, String(question ?? ""), viewer.email);
    return { ok: true, turns, usage: await chatUsage(projectId) };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, message: "Слишком много запросов к ИИ. Повторите через минуту." };
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, message: "Ключ ИИ недействителен (ANTHROPIC_API_KEY)." };
    if (error instanceof Anthropic.APIError) return { ok: false, message: `ИИ сейчас недоступен (${error.status ?? "сеть"}). Попробуйте ещё раз.` };
    return { ok: false, message: (error as Error).message };
  }
}
