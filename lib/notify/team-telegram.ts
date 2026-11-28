import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { teamTelegram } from "@/db/schema";
import { normalizeEmail } from "@/lib/access/policy";

/**
 * Personal Telegram of team members: deadline reminders and project-score news go to them in private.
 * A separate bot (TELEGRAM_NOTIFY_BOT_TOKEN) runs on the dashboard's webhook, so it works without the agent's laptop:
 * the admin enters a @username, the person presses Start, and the webhook stores their chat id.
 */

export const notifyBotConfigured = () => Boolean(process.env.TELEGRAM_NOTIFY_BOT_TOKEN);

/** «@Name», «Name», «t.me/Name» → «name»; empty → null. */
export function normalizeUsername(raw: string | null | undefined): string | null {
  const v = String(raw ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?t(elegram)?\.me\//i, "")
    .replace(/^@/, "")
    .toLowerCase();
  return /^[a-z0-9_]{4,32}$/.test(v) ? v : null;
}

export interface TeamTelegram {
  email: string;
  username: string | null;
  linked: boolean;
}

export async function listTeamTelegram(emails?: string[]): Promise<Map<string, TeamTelegram & { chatId: string | null }>> {
  const db = getDb();
  const rows = emails?.length
    ? await db.select().from(teamTelegram).where(inArray(teamTelegram.email, emails.map(normalizeEmail)))
    : await db.select().from(teamTelegram);
  return new Map(rows.map((r) => [r.email, { email: r.email, username: r.username, linked: !!r.chatId, chatId: r.chatId }]));
}

/** Sets or clears the @username. A changed username drops the old chat id: the new account has to press Start. */
export async function setTeamTelegramUsername(email: string, raw: string | null) {
  const db = getDb();
  const key = normalizeEmail(email);
  const username = normalizeUsername(raw);
  const [current] = await db.select().from(teamTelegram).where(eq(teamTelegram.email, key)).limit(1);
  if (!username) {
    if (current) await db.delete(teamTelegram).where(eq(teamTelegram.email, key));
    return null;
  }
  if (current?.username === username) return username;
  await db
    .insert(teamTelegram)
    .values({ email: key, username, chatId: null, linkedAt: null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: teamTelegram.email, set: { username, chatId: null, linkedAt: null, updatedAt: new Date() } });
  return username;
}

/** Webhook: the person pressed Start. Returns the emails it was linked to (empty = unknown username). */
export async function linkTelegramChat(usernameRaw: string | undefined, chatId: string) {
  const username = normalizeUsername(usernameRaw);
  if (!username) return [];
  const rows = await getDb()
    .update(teamTelegram)
    .set({ chatId, linkedAt: new Date(), updatedAt: new Date() })
    .where(eq(sql`lower(${teamTelegram.username})`, username))
    .returning({ email: teamTelegram.email });
  return rows.map((r) => r.email);
}

export async function botUsername(): Promise<string | null> {
  if (process.env.TELEGRAM_NOTIFY_BOT_USERNAME) return process.env.TELEGRAM_NOTIFY_BOT_USERNAME.replace(/^@/, "");
  if (!notifyBotConfigured()) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_NOTIFY_BOT_TOKEN}/getMe`, { next: { revalidate: 86_400 } });
    const data = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    return data.result?.username ?? null;
  } catch {
    return null;
  }
}

export async function sendPersonal(chatId: string, text: string, button?: { text: string; url: string }) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_NOTIFY_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram: ${data.description ?? res.status}`);
}

export { escapeHtml } from "./messages";
