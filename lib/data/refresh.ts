import "server-only";
import { revalidateTag } from "next/cache";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appState, projectIntegrations, projects } from "@/db/schema";
import { refreshGoogleIfStale } from "@/lib/google/sync";
import { syncIntegration } from "@/lib/integrations/run";
import { listIntegrations } from "@/lib/integrations/store";
import type { CrmConfig } from "@/lib/integrations/types";
import { refreshMetaIfStale } from "@/lib/meta/sync";
import { refreshSocialStats } from "@/lib/social/stats";
import { TAGS } from "./tags";

/** Everything is refreshed at most this often, whoever asks: the hourly call, an opened dashboard or both at once. */
const EVERY_MS = 50 * 60_000;

/**
 * Background refresh of every active project: ad numbers (Meta, Google), leads (sheets and CRMs) and the statistics of
 * the connected social accounts. Called every hour from outside (/api/cron/refresh) and when the dashboard is opened.
 * The claim on `app_state.refresh` lets only one caller in per period, so calling it often costs one small query.
 * The nightly run stays as it is: reports, accesses and project checks are its job.
 */
export async function refreshAllStale(): Promise<{ ran: boolean; projects: number }> {
  const db = getDb();
  await db.insert(appState).values({ key: "refresh", updatedAt: new Date(0) }).onConflictDoNothing();
  const claimed = await db
    .update(appState)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(appState.key, "refresh"), lt(appState.updatedAt, new Date(Date.now() - EVERY_MS))))
    .returning({ key: appState.key });
  if (!claimed.length) return { ran: false, projects: 0 };

  const active = await db.select({ id: projects.id, sources: projects.sources }).from(projects).where(eq(projects.status, "active"));
  const failed = (what: string, id: string) => (e: unknown) => console.error(`refresh ${what}`, id, (e as Error).message);
  for (const p of active) {
    // One project at a time, its sources together: the networks throttle bursts.
    await Promise.all([
      refreshMetaIfStale(p.id, p.sources, EVERY_MS).catch(failed("meta", p.id)),
      refreshGoogleIfStale(p.id, p.sources, EVERY_MS).catch(failed("google", p.id)),
      refreshSocialStats(p.id, { maxAgeMs: EVERY_MS }).catch(failed("social", p.id)),
      refreshLeads(p.id).catch(failed("leads", p.id)),
    ]);
    revalidateTag(TAGS.project(p.id), "max");
  }
  revalidateTag(TAGS.projects, "max");
  return { ran: true, projects: active.length };
}

/** Lead sheets and polled CRMs of a project that were not read within the period. The claim on `last_sync_at` keeps it to one reader. */
async function refreshLeads(projectId: string) {
  const claimed = await getDb()
    .update(projectIntegrations)
    .set({ lastSyncAt: sql`now()` })
    .where(
      and(
        eq(projectIntegrations.projectId, projectId),
        inArray(projectIntegrations.kind, ["sheets_leads", "crm"]),
        or(isNull(projectIntegrations.lastSyncAt), lt(projectIntegrations.lastSyncAt, new Date(Date.now() - EVERY_MS))),
      ),
    )
    .returning({ kind: projectIntegrations.kind });
  if (!claimed.length) return;
  const kinds = new Set(claimed.map((c) => c.kind));
  for (const rec of await listIntegrations(projectId)) {
    if (!kinds.has(rec.kind) || (rec.kind === "crm" && (rec.config as CrmConfig).type === "webhook")) continue;
    // A failure is stored on the integration and shown in «Вводные» and the log.
    await syncIntegration(rec).catch(() => undefined);
  }
}
