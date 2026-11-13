import type { Permissions } from "@/lib/access/roles";
import { getVisibleProjects } from "@/lib/data";
import type { ProjectWithStats } from "@/lib/domain/types";
import { first, parseRange } from "./params";

type SearchParams = Record<string, string | string[] | undefined>;

export interface Workspace {
  projects: { id: string; name: string }[];
  project: ProjectWithStats | null;
  range: ReturnType<typeof parseRange>;
  /** Current selection, to keep it when switching tabs. */
  query: { p?: string; range?: string };
}

/** Picks the project (`?p=`) and period (`?range=`) for the Ads and SMM pages. */
export async function resolveWorkspace(searchParams: SearchParams, permissions: Permissions): Promise<Workspace> {
  const all = (await getVisibleProjects(permissions)).filter((p) => p.status !== "archived");
  const wanted = first(searchParams.p);
  const project = all.find((p) => p.id === wanted) ?? all.find((p) => p.status === "active") ?? all[0] ?? null;
  const range = parseRange(first(searchParams.range));

  return {
    projects: all.map(({ id, name }) => ({ id, name })),
    project,
    range,
    query: { p: project?.id, range: range.value === "30" ? undefined : range.value },
  };
}
