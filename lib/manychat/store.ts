import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { manychatEvents, manychatHooks } from "@/db/schema";
import { randomToken } from "@/lib/crypto";

export type ManychatStep = "start" | "contact" | "lead";
const STEPS: Record<string, ManychatStep> = { start: "start", keyword: "start", trigger: "start", contact: "contact", contact_left: "contact", lead: "lead" };
/** The same person, word and step again within this time is one event (a re-run of the automation or a retry). */
const DEDUPE_MS = 10 * 60_000;

/** The project's address token, created on first use. */
export async function ensureManychatToken(projectId: string) {
  const db = getDb();
  await db.insert(manychatHooks).values({ projectId, token: randomToken() }).onConflictDoNothing();
  const [row] = await db.select().from(manychatHooks).where(eq(manychatHooks.projectId, projectId)).limit(1);
  return row!.token;
}

export async function projectByManychatToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await getDb().select({ projectId: manychatHooks.projectId }).from(manychatHooks).where(eq(manychatHooks.token, token)).limit(1);
  return row?.projectId ?? null;
}

const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
/** ManyChat leaves `{{Field}}` as it is when the field is empty for this contact. */
const filled = (v: string) => (/^\{\{.*\}\}$/.test(v) ? "" : v);

/**
 * Reads the body of a ManyChat request. A person's text with quotes in it can break the JSON ManyChat builds,
 * so when it does not parse the fields are picked out one by one.
 */
export function parseManychatBody(raw: string): { step: ManychatStep; keyword: string; subscriberId: string; igUsername: string; lastInput: string } | null {
  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    data = {};
    for (const key of ["step", "keyword", "subscriber_id", "ig_username"]) {
      const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
      if (m) data[key] = m[1];
    }
    const last = raw.match(/"last_input"\s*:\s*"([\s\S]*?)"\s*[,}]/);
    if (last) data.last_input = last[1];
  }
  if (!data) return null;
  const step = STEPS[text(data.step, 20).toLowerCase()];
  const keyword = text(data.keyword, 60).toUpperCase();
  if (!step || !keyword) return null;
  return { step, keyword, subscriberId: filled(text(data.subscriber_id, 40)), igUsername: filled(text(data.ig_username, 60)).replace(/^@/, ""), lastInput: filled(text(data.last_input, 300)) };
}

/** Stores the step unless the same one from the same person has just come. */
export async function recordManychatEvent(projectId: string, event: NonNullable<ReturnType<typeof parseManychatBody>>) {
  const db = getDb();
  if (event.subscriberId) {
    const [same] = await db
      .select({ id: manychatEvents.id })
      .from(manychatEvents)
      .where(
        and(
          eq(manychatEvents.projectId, projectId),
          eq(manychatEvents.subscriberId, event.subscriberId),
          eq(manychatEvents.step, event.step),
          eq(manychatEvents.keyword, event.keyword),
          gte(manychatEvents.receivedAt, new Date(Date.now() - DEDUPE_MS)),
        ),
      )
      .limit(1);
    if (same) return false;
  }
  await db.insert(manychatEvents).values({ id: randomToken(12), projectId, ...event });
  return true;
}

/** For «Вводные»: is anything arriving. */
export async function manychatStatus(projectId: string) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int`, last: sql<string | null>`max(${manychatEvents.receivedAt})` })
    .from(manychatEvents)
    .where(eq(manychatEvents.projectId, projectId));
  return { count: row?.count ?? 0, lastAt: row?.last ? new Date(row.last).toISOString() : null };
}

export async function manychatEventsIn(projectId: string, from: Date, to: Date) {
  return getDb()
    .select()
    .from(manychatEvents)
    .where(and(eq(manychatEvents.projectId, projectId), gte(manychatEvents.receivedAt, from), lte(manychatEvents.receivedAt, to)))
    .orderBy(desc(manychatEvents.receivedAt));
}
