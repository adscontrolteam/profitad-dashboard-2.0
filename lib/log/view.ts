import type { ProjectLogRow } from "@/db/schema";
import type { LogItem } from "@/components/log/project-log";

export const toLogItems = (rows: ProjectLogRow[]): LogItem[] =>
  rows.map((l) => ({
    id: l.id,
    at: l.updatedAt.toISOString(),
    source: l.source,
    kind: l.kind,
    title: l.title,
    body: l.body,
    status: l.status,
    area: l.area,
    link: l.link,
    resolvedBy: l.resolvedBy,
    resolutionNote: l.resolutionNote,
    focus: l.focus,
    impact: l.impact,
    effortMin: l.effortMin,
    rollback: l.rollback,
  }));
