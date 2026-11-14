import "server-only";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projectBriefs, projects, type ProjectBriefRow } from "@/db/schema";
import { ALL_QUESTION_IDS, BRIEF_LANGS, BRIEF_SECTIONS, type BriefLang } from "./questions";

const newToken = () => randomBytes(24).toString("base64url");
const isLang = (v: unknown): v is BriefLang => BRIEF_LANGS.includes(v as BriefLang);
const KNOWN = new Set(ALL_QUESTION_IDS);
const MAX_ANSWER = 6000;

export async function getBrief(projectId: string) {
  const [row] = await getDb().select().from(projectBriefs).where(eq(projectBriefs.projectId, projectId)).limit(1);
  return row ?? null;
}

/** The brief of a project, created on first use. */
export async function ensureBrief(projectId: string) {
  const existing = await getBrief(projectId);
  if (existing) return existing;
  await getDb().insert(projectBriefs).values({ projectId, token: newToken() }).onConflictDoNothing();
  return (await getBrief(projectId))!;
}

/** For the public page: the brief behind a link, with the project name. Null = wrong or revoked link. */
export async function getBriefByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await getDb()
    .select({ brief: projectBriefs, name: projects.name })
    .from(projectBriefs)
    .innerJoin(projects, eq(projects.id, projectBriefs.projectId))
    .where(eq(projectBriefs.token, token))
    .limit(1);
  return row ?? null;
}

const clean = (map: unknown) => {
  const out: Record<string, string> = {};
  if (!map || typeof map !== "object") return out;
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    if (KNOWN.has(k) && typeof v === "string") out[k] = v.slice(0, MAX_ANSWER);
  }
  return out;
};

/** Merges answers into the stored ones (jsonb ||), so two people typing in different fields do not overwrite each other. */
export async function saveAnswers(projectId: string, answers: unknown) {
  const patch = clean(answers);
  if (!Object.keys(patch).length) return;
  await getDb()
    .update(projectBriefs)
    .set({ answers: sql`${projectBriefs.answers} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
    .where(eq(projectBriefs.projectId, projectId));
}

export async function saveAdmin(projectId: string, input: { notes?: unknown; hidden?: unknown; lang?: unknown; status?: unknown }) {
  const set: Partial<ProjectBriefRow> = { updatedAt: new Date() };
  if (input.lang !== undefined && isLang(input.lang)) set.lang = input.lang;
  if (Array.isArray(input.hidden)) set.hidden = input.hidden.filter((id): id is string => typeof id === "string" && KNOWN.has(id));
  if (input.status === "draft" || input.status === "closed" || input.status === "submitted") set.status = input.status;
  const db = getDb();
  await db.update(projectBriefs).set(set).where(eq(projectBriefs.projectId, projectId));
  const notes = clean(input.notes);
  if (Object.keys(notes).length) {
    await db
      .update(projectBriefs)
      .set({ notes: sql`${projectBriefs.notes} || ${JSON.stringify(notes)}::jsonb` })
      .where(eq(projectBriefs.projectId, projectId));
  }
}

/** A new link; the old one stops working at once. */
export async function rotateToken(projectId: string) {
  const token = newToken();
  await getDb().update(projectBriefs).set({ token, updatedAt: new Date() }).where(eq(projectBriefs.projectId, projectId));
  return token;
}

export async function markSubmitted(projectId: string) {
  const rows = await getDb()
    .update(projectBriefs)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(projectBriefs.projectId, projectId))
    .returning({ id: projectBriefs.projectId });
  return rows.length > 0;
}

export async function addBriefFile(projectId: string, name: string) {
  await getDb()
    .update(projectBriefs)
    .set({ files: sql`${projectBriefs.files} || ${JSON.stringify([{ name: name.slice(0, 200), at: new Date().toISOString() }])}::jsonb`, updatedAt: new Date() })
    .where(eq(projectBriefs.projectId, projectId));
}

export async function touchSeen(projectId: string) {
  await getDb().update(projectBriefs).set({ clientSeenAt: new Date() }).where(eq(projectBriefs.projectId, projectId));
}

/** Answered / shown question counts. */
export function briefProgress(brief: Pick<ProjectBriefRow, "answers" | "hidden">) {
  const shown = ALL_QUESTION_IDS.filter((id) => !brief.hidden.includes(id));
  return { total: shown.length, done: shown.filter((id) => (brief.answers[id] ?? "").trim()).length };
}

/** The whole brief as plain text for «Дирижёр»: sections, questions, answers and our notes. */
export function briefAsText(brief: Pick<ProjectBriefRow, "answers" | "notes" | "hidden" | "lang">) {
  const lang = isLang(brief.lang) ? brief.lang : "ru";
  const parts: string[] = [];
  for (const s of BRIEF_SECTIONS) {
    const lines: string[] = [];
    for (const item of s.questions) {
      if (brief.hidden.includes(item.id)) continue;
      const a = (brief.answers[item.id] ?? "").trim();
      const n = (brief.notes[item.id] ?? "").trim();
      if (!a && !n) continue;
      lines.push(`— ${item.q[lang]}\n${a || "(нет ответа)"}${n ? `\n[заметка агентства: ${n}]` : ""}`);
    }
    if (lines.length) parts.push(`## ${s.title[lang]}\n${lines.join("\n\n")}`);
  }
  return parts.join("\n\n");
}
