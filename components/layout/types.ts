import type { PaceLevel } from "@/lib/domain/stats";

export interface ProjectNavItem {
  id: string;
  name: string;
  /** Running now: the default project when none is chosen. */
  active: boolean;
  /** Pace signal; only set for projects that are running. */
  signal: PaceLevel | null;
}

/** Реклама or SMM of a project, with the sub-tabs this viewer may open. */
export interface ProjectArea {
  key: "ads" | "smm";
  label: string;
  href: "/ads" | "/smm";
  tabs: { label: string; href: string }[];
}
