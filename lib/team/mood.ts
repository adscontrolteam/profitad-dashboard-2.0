import "server-only";
import { isAdminEmail } from "@/lib/access/admins";
import { getProjects } from "@/lib/data";
import { HEALTH_GREEN, HEALTH_YELLOW } from "@/lib/domain/health";
import { projectsAttention } from "@/lib/projects/health";
import { listTeam } from "@/lib/tasks/team";

/**
 * The team's «тотемы»: each person's creature looks as well as their projects are doing.
 * A person's score = the average health score (0–100) of the active projects they lead (SMM / MediaBuyer).
 * The admin's own creature follows the whole agency: the average of all active projects.
 */

export type Mood = "fire" | "happy" | "ok" | "sad" | "exhausted" | "idle";


export function moodOf(score: number | null): Mood {
  if (score === null) return "idle";
  if (score >= 85) return "fire";
  if (score >= HEALTH_GREEN) return "happy";
  if (score >= HEALTH_YELLOW) return "ok";
  if (score >= 20) return "sad";
  return "exhausted";
}

export interface TotemProject {
  id: string;
  name: string;
  score: number | null;
  role: "SMM" | "MediaBuyer" | "агентство";
}

export interface TotemMember {
  email: string;
  name: string | null;
  imageUrl: string | null;
  choice: { kind?: string | null; color?: string | null } | null;
  score: number | null;
  mood: Mood;
  projects: TotemProject[];
  isAdmin: boolean;
}

const average = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? Math.round(known.reduce((a, v) => a + v, 0) / known.length) : null;
};

export async function teamTotems(): Promise<TotemMember[]> {
  const [team, projects] = await Promise.all([listTeam(), getProjects()]);
  const active = projects.filter((p) => p.status === "active");
  const attention = await projectsAttention(active);
  const scoreOf = (id: string) => attention.get(id)?.health.score ?? null;

  return team.map((m) => {
    const admin = isAdminEmail(m.email);
    const led: TotemProject[] = active.flatMap((p) => {
      const roles: TotemProject["role"][] = [];
      if (p.owners.mediaBuyer === m.email) roles.push("MediaBuyer");
      if (p.owners.smm === m.email) roles.push("SMM");
      return roles.length ? [{ id: p.id, name: p.name, score: scoreOf(p.id), role: roles[0] }] : [];
    });
    const own = led.length || !admin ? led : active.map((p) => ({ id: p.id, name: p.name, score: scoreOf(p.id), role: "агентство" as const }));
    const score = average(own.map((p) => p.score));
    return {
      email: m.email,
      name: m.name,
      imageUrl: m.imageUrl,
      choice: m.totem ?? null,
      score,
      mood: moodOf(score),
      projects: own.sort((a, b) => (a.score ?? 101) - (b.score ?? 101)),
      isAdmin: admin,
    };
  });
}
