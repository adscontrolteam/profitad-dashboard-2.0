import "server-only";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, tasks } from "@/db/schema";
import { getProjects } from "@/lib/data";
import type { HealthZone } from "@/lib/domain/health";
import { appUrl } from "@/lib/log/notify";
import { projectsAttention } from "@/lib/projects/health";
import { listTeam } from "@/lib/tasks/team";
import { zoneMessage } from "./messages";
import { escapeHtml, listTeamTelegram, notifyBotConfigured, sendPersonal } from "./team-telegram";

/**
 * Daily personal Telegram messages to the team (run from the 09:00 Warsaw cron):
 * - tasks: the day before the deadline (once), then every 2 days while overdue — one message per person;
 * - projects: when a project's score moves to another zone, its MediaBuyer and SMM hear about it.
 */

const DAY = 86_400_000;
/** The cron runs once a day: allow a few hours of drift so «every 2 days» does not slip to 3. */
const SLACK = 6 * 3_600_000;

type Result = { projectId: string; kind: string; ok: boolean; message: string };

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysWord = (n: number) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? "день" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "дня" : "дней";
};

async function names() {
  const team = await listTeam();
  return new Map(team.map((m) => [m.email, m.name?.split(/\s+/)[0] ?? m.email.split("@")[0]]));
}

export async function notifyTaskDeadlines(now = new Date()): Promise<Result[]> {
  if (!notifyBotConfigured()) return [];
  const db = getDb();
  const today = isoDay(now.getTime());
  const tomorrow = isoDay(now.getTime() + DAY);
  const open = await db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), ne(tasks.stage, "done"), isNotNull(tasks.assigneeEmail), isNotNull(tasks.deadline)));

  const due = open.filter((t) => t.deadline === tomorrow && !t.dueNotifiedAt);
  const overdue = open.filter(
    (t) => t.deadline! < today && (!t.overdueNotifiedAt || now.getTime() - t.overdueNotifiedAt.getTime() >= 2 * DAY - SLACK),
  );
  if (!due.length && !overdue.length) return [];

  const people = [...new Set([...due, ...overdue].map((t) => t.assigneeEmail!))];
  const [telegram, projectRows, first] = await Promise.all([
    listTeamTelegram(people),
    db.select({ id: projects.id, name: projects.name }).from(projects),
    names(),
  ]);
  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
  const line = (t: (typeof open)[number], suffix = "") =>
    `• ${escapeHtml(t.title)}${t.projectId ? ` — ${escapeHtml(projectName.get(t.projectId) ?? t.projectId)}` : ""}${suffix}`;

  const out: Result[] = [];
  for (const email of people) {
    const chat = telegram.get(email)?.chatId;
    if (!chat) continue;
    const mineDue = due.filter((t) => t.assigneeEmail === email);
    const mineOver = overdue.filter((t) => t.assigneeEmail === email);
    const parts = [`${escapeHtml(first.get(email) ?? "")}, привет! По задачам:`];
    if (mineDue.length) parts.push(`\n⏰ <b>Завтра дедлайн</b>\n${mineDue.map((t) => line(t)).join("\n")}`);
    if (mineOver.length) {
      parts.push(
        `\n🔴 <b>Просрочено</b>\n${mineOver
          .map((t) => {
            const late = Math.round((Date.parse(today) - Date.parse(t.deadline!)) / DAY);
            return line(t, ` · ${late} ${daysWord(late)}`);
          })
          .join("\n")}`,
      );
    }
    try {
      await sendPersonal(chat, parts.join("\n"), { text: "Открыть задачи", url: `${appUrl()}/profile` });
      if (mineDue.length) await db.update(tasks).set({ dueNotifiedAt: now }).where(inArray(tasks.id, mineDue.map((t) => t.id)));
      if (mineOver.length) await db.update(tasks).set({ overdueNotifiedAt: now }).where(inArray(tasks.id, mineOver.map((t) => t.id)));
      out.push({ projectId: "", kind: "telegram_tasks", ok: true, message: `${email}: ${mineDue.length} завтра, ${mineOver.length} просрочено` });
    } catch (e) {
      out.push({ projectId: "", kind: "telegram_tasks", ok: false, message: `${email}: ${(e as Error).message}` });
    }
  }
  return out;
}

export async function notifyHealthChanges(now = new Date()): Promise<Result[]> {
  const db = getDb();
  const active = (await getProjects()).filter((p) => p.status === "active");
  if (!active.length) return [];
  const attention = await projectsAttention(active);
  const stored = new Map(
    (await db.select({ id: projects.id, zone: projects.healthZone }).from(projects).where(inArray(projects.id, active.map((p) => p.id)))).map(
      (r) => [r.id, r.zone as HealthZone | null],
    ),
  );
  const zoneOf = (id: string) => attention.get(id)?.health.zone ?? "none";
  const scoreOf = (id: string) => attention.get(id)?.health.score ?? null;

  const changes = active.filter((p) => {
    const before = stored.get(p.id);
    const after = zoneOf(p.id);
    return before && before !== "none" && after !== "none" && before !== after;
  });

  const out: Result[] = [];
  if (changes.length && notifyBotConfigured()) {
    const people = [...new Set(changes.flatMap((p) => [p.owners.mediaBuyer, p.owners.smm]).filter((e): e is string => !!e))];
    const [telegram, first] = await Promise.all([listTeamTelegram(people), names()]);
    for (const p of changes) {
      const from = stored.get(p.id) as Exclude<HealthZone, "none">;
      const to = zoneOf(p.id) as Exclude<HealthZone, "none">;
      for (const email of new Set([p.owners.mediaBuyer, p.owners.smm].filter((e): e is string => !!e))) {
        const chat = telegram.get(email)?.chatId;
        if (!chat) continue;
        const mine = active.filter((x) => x.id !== p.id && (x.owners.mediaBuyer === email || x.owners.smm === email));
        const yellow = mine.filter((x) => zoneOf(x.id) === "yellow").map((x) => x.name);
        const red = mine.filter((x) => zoneOf(x.id) === "red").map((x) => x.name);
        const text = zoneMessage({ name: first.get(email) ?? "", project: p.name, score: scoreOf(p.id) ?? 0, from, to, toImprove: yellow.length ? yellow : red });
        try {
          await sendPersonal(chat, text, { text: "Открыть проект", url: `${appUrl()}/projects/${encodeURIComponent(p.id)}` });
          out.push({ projectId: p.id, kind: "telegram_score", ok: true, message: `${email}: ${from} → ${to}` });
        } catch (e) {
          out.push({ projectId: p.id, kind: "telegram_score", ok: false, message: `${email}: ${(e as Error).message}` });
        }
      }
    }
  }

  // Remember today's zones (the first run only records them, so nobody gets a message for the past).
  for (const p of active) {
    const zone = zoneOf(p.id);
    if (stored.get(p.id) !== zone) await db.update(projects).set({ healthZone: zone, healthZoneAt: now }).where(eq(projects.id, p.id));
  }
  return out;
}
