import { cacheLife, cacheTag } from "next/cache";
import { visibleProjects } from "@/lib/access/policy";
import type { Permissions } from "@/lib/access/roles";
import { paceLevel, summarizeStatuses, withStats } from "@/lib/domain/stats";
import type { ProjectWithStats, StatusSummary } from "@/lib/domain/types";
import type { DataSource } from "./source";
import { dbSource } from "./sources/db";
import { TAGS } from "./tags";

/** Swap this for another provider — nothing else has to change. */
const source: DataSource = dbSource;

/** Unscoped and cached for everyone; pages must narrow it with the viewer's permissions. */
export async function getProjects(): Promise<ProjectWithStats[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAGS.projects);

  const now = new Date();
  const projects = await source.listProjects();
  return projects.map((p) => withStats(p, now));
}

export async function getProject(id: string): Promise<ProjectWithStats | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAGS.projects, TAGS.project(id));

  const project = await source.getProject(id);
  return project ? withStats(project, new Date()) : null;
}

export async function getVisibleProjects(permissions: Permissions) {
  return visibleProjects(permissions, await getProjects());
}

export async function getActiveProjects(permissions: Permissions) {
  const projects = await getVisibleProjects(permissions);
  return projects.filter((p) => p.status === "active");
}

export async function getStatusSummary(permissions: Permissions): Promise<StatusSummary> {
  return summarizeStatuses(await getVisibleProjects(permissions));
}

export async function getProjectNav() {
  const projects = await getProjects();
  return projects.filter((p) => p.status !== "archived").map(({ id, name, status, stats }) => ({
    id,
    name,
    signal: status === "active" ? paceLevel(stats.primary?.pace) : null,
  }));
}
