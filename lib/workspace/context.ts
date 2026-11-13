import type { Permissions } from "@/lib/access/roles";
import { getVisibleProjects } from "@/lib/data";
import type { ProjectWithStats } from "@/lib/domain/types";
import { first, parsePeriod, type Period } from "./params";

type SearchParams = Record<string, string | string[] | undefined>;

export interface Workspace {
  projects: { id: string; name: string }[];
  project: ProjectWithStats | null;
  range: Period;
  /** Current selection, to keep it when switching tabs. */
  query: { p?: string; range?: string; from?: string; to?: string };
}

/** Picks the project (`?p=`) and period (`?range=` or `?from=&to=`) for the Ads and SMM pages. */
export async function resolveWorkspace(searchParams: SearchParams, permissions: Permissions): Promise<Workspace> {
  const all = (await getVisibleProjects(permissions)).filter((p) => p.status !== "archived");
  const wanted = first(searchParams.p);
  const project = all.find((p) => p.id === wanted) ?? all.find((p) => p.status === "active") ?? all[0] ?? null;
  const range = parsePeriod(first(searchParams.range), first(searchParams.from), first(searchParams.to));

  return {
    projects: all.map(({ id, name }) => ({ id, name })),
    project,
    range,
    query: range.preset
      ? { p: project?.id, range: range.preset === "30" ? undefined : range.preset }
      : { p: project?.id, from: range.from, to: range.to },
  };
}
