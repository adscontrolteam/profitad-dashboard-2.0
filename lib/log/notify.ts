import "server-only";
import { and, eq, gt, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projectLog, projects } from "@/db/schema";

const EVERY = 3 * 86_400_000;
/** Cron runs once a day: allow a few hours of drift so «every 3 days» does not slip to 4. */
const SLACK = 6 * 3_600_000;

export const appUrl = () => (process.env.APP_URL || "https://profitad-dashboard-2.vercel.app").replace(/\/$/, "");
export const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

export async function sendTelegram(chatId: string, threadId: number | null, text: string, button?: { text: string; url: string }) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      ...(threadId ? { message_thread_id: threadId } : {}),
      text,
      disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram: ${data.description ?? res.status}`);
}

/**
 * At most every 3 days, to each project chat that has something in its log since the last reminder (or entries still
 * waiting for a decision): one message with a «Посмотреть Лог» button. Nothing else goes to Telegram from the log.
 */
export async function notifyLogs(now = new Date()) {
  if (!telegramConfigured()) return [];
  const db = getDb();
  const list = await db
    .select({ id: projects.id, name: projects.name, chat: projects.telegramChatId, thread: projects.telegramThreadId, last: projects.logNotifiedAt })
    .from(projects)
    .where(and(isNotNull(projects.telegramChatId), sql`${projects.status} <> 'archived'`));
  const out: { projectId: string; kind: string; ok: boolean; message: string }[] = [];
  for (const p of list) {
    if (!p.chat || (p.last && now.getTime() - p.last.getTime() < EVERY - SLACK)) continue;
    const since = p.last ?? new Date(0);
    const [row] = await db
      .select({
        waiting: sql<number>`count(*) filter (where ${projectLog.status} = 'needs_you')`,
        fresh: sql<number>`count(*) filter (where ${projectLog.updatedAt} > ${since})`,
      })
      .from(projectLog)
      .where(and(eq(projectLog.projectId, p.id), or(eq(projectLog.status, "needs_you"), gt(projectLog.updatedAt, since))));
    const waiting = Number(row?.waiting ?? 0), fresh = Number(row?.fresh ?? 0);
    if (!waiting && !fresh) continue;
    try {
      await sendTelegram(
        p.chat,
        p.thread ?? null,
        `📋 ${p.name}${waiting ? ` · ждут вашего решения: ${waiting}` : ""}`,
        { text: "Посмотреть Лог", url: `${appUrl()}/projects/${encodeURIComponent(p.id)}#log` },
      );
      await db.update(projects).set({ logNotifiedAt: now }).where(eq(projects.id, p.id));
      out.push({ projectId: p.id, kind: "telegram_log", ok: true, message: `отправлено (ждут: ${waiting}, новых: ${fresh})` });
    } catch (error) {
      out.push({ projectId: p.id, kind: "telegram_log", ok: false, message: (error as Error).message });
    }
  }
  return out;
}
