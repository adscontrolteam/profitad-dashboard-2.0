"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { projectAreaOf } from "@/config/navigation";
import type { ProjectNavItem } from "./types";

/**
 * The project the viewer is inside right now: /projects/<id>, or Реклама / SMM with ?p=<id>
 * (without ?p= those pages open the first running project, same rule as on the server).
 */
export function useCurrentProject(projects: ProjectNavItem[]): ProjectNavItem | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onProjectPage = pathname.match(/^\/projects\/([^/]+)/);
  if (onProjectPage) return projects.find((p) => p.id === onProjectPage[1]) ?? null;
  if (!projectAreaOf(pathname)) return null;
  const wanted = searchParams.get("p");
  return projects.find((p) => p.id === wanted) ?? projects.find((p) => p.active) ?? projects[0] ?? null;
}
