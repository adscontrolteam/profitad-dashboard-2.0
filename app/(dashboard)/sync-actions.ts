"use server";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { projectIntegrations } from "@/db/schema";
import { canViewProject } from "@/lib/access/policy";
import { requireViewer } from "@/lib/access/viewer";
import { syncIntegration } from "@/lib/integrations/run";
import { listIntegrations } from "@/lib/integrations/store";

/** The lead sheet is re-read when a project page is opened and the last read is older than this. */
const FRESH_MS = 2 * 60_000;

/**
 * Called by the project pages when they open: pulls the client's lead sheet again if it has not been read for a
 * couple of minutes, so a status or payment typed into the sheet shows up without waiting for the nightly run.
 * The claim on `last_sync_at` lets only one of several open tabs do the work.
 */
export async function refreshProjectLeadsAction(projectId: string): Promise<{ refreshed: boolean }> {
  const viewer = await requireViewer();
  if (!canViewProject(viewer.permissions, projectId)) return { refreshed: false };
  const stale = new Date(Date.now() - FRESH_MS);
  const claimed = await getDb()
    .update(projectIntegrations)
    .set({ lastSyncAt: sql`now()` })
    .where(
      and(
        eq(projectIntegrations.projectId, projectId),
        eq(projectIntegrations.kind, "sheets_leads"),
        or(isNull(projectIntegrations.lastSyncAt), lt(projectIntegrations.lastSyncAt, stale)),
      ),
    )
    .returning({ projectId: projectIntegrations.projectId });
  if (!claimed.length) return { refreshed: false };
  const rec = (await listIntegrations(projectId)).find((r) => r.kind === "sheets_leads");
  if (!rec) return { refreshed: false };
  try {
    await syncIntegration(rec);
    return { refreshed: true };
  } catch {
    // The error is stored on the integration and shown in «Вводные» and the log; the page keeps its data.
    return { refreshed: false };
  }
}
