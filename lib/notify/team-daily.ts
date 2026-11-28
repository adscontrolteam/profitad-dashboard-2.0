import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { getProjects } from "@/lib/data";
import type { HealthZone } from "@/lib/domain/health";
import { appUrl, sendTelegram, telegramConfigured } from "@/lib/log/notify";
import { projectsAttention } from "@/lib/projects/health";
import { listTeam } from "@/lib/tasks/team";
import { zoneMessage, type Zone } from "./messages";

/**
 * Daily (09:00 Warsaw cron): when a project's score moves to another zone, the team chat hears about it,
 * naming the project's MediaBuyer and SMM. The team chat is TELEGRAM_TEAM_CHAT («chat id» or «chat id:topic id»,
 * from /whereami in that chat); the message goes through the same bot as «Посмотреть Лог» (TELEGRAM_BOT_TOKEN).
 */

type Result = { projectId: string; kind: string; ok: boolean; message: string };

export function teamChat(): { chat: string; thread: number | null } | null {
  const raw = (process.env.TELEGRAM_TEAM_CHAT ?? "").trim();
  if (!raw) return null;
  const [chat, thread] = raw.split(":");
  return { chat, thread: thread ? Number(thread) || null : null };
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
  const scoreOf = (id: string) => attention.get(id)?.health.score ?? 0;

  const changes = active.filter((p) => {
    const before = stored.get(p.id);
    const after = zoneOf(p.id);
    return before && before !== "none" && after !== "none" && before !== after;
  });

  const out: Result[] = [];
  const target = teamChat();
  if (changes.length && target && telegramConfigured()) {
    const team = await listTeam();
    const first = new Map(team.map((m) => [m.email, m.name?.split(/\s+/)[0] ?? m.email.split("@")[0]]));
    for (const p of changes) {
      const owners = [...new Set([p.owners.mediaBuyer, p.owners.smm].filter((e): e is string => !!e))];
      // For a thank-you: the owners' other projects that are still in yellow (or red, when none are yellow).
      const others = active.filter((x) => x.id !== p.id && owners.some((e) => x.owners.mediaBuyer === e || x.owners.smm === e));
      const yellow = others.filter((x) => zoneOf(x.id) === "yellow").map((x) => x.name);
      const red = others.filter((x) => zoneOf(x.id) === "red").map((x) => x.name);
      const text = zoneMessage({
        names: owners.map((e) => first.get(e) ?? e.split("@")[0]),
        project: p.name,
        score: scoreOf(p.id),
        from: stored.get(p.id) as Zone,
        to: zoneOf(p.id) as Zone,
        toImprove: yellow.length ? yellow : red,
      });
      try {
        await sendTelegram(target.chat, target.thread, text, { text: "Открыть проект", url: `${appUrl()}/projects/${encodeURIComponent(p.id)}` });
        out.push({ projectId: p.id, kind: "telegram_score", ok: true, message: `${stored.get(p.id)} → ${zoneOf(p.id)}` });
      } catch (e) {
        out.push({ projectId: p.id, kind: "telegram_score", ok: false, message: (e as Error).message });
      }
    }
  }

  // Remember today's zones (the first run only records them, so nobody hears about the past).
  for (const p of active) {
    const zone = zoneOf(p.id);
    if (stored.get(p.id) !== zone) await db.update(projects).set({ healthZone: zone, healthZoneAt: now }).where(eq(projects.id, p.id));
  }
  return out;
}
