import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, projects } from "@/db/schema";
import { adsConfigured, gaql } from "./ads";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

type Row = Record<string, Record<string, unknown>>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Pulls Google Ads campaign × day stats of every Google account of the project into ad_metrics_daily (platform "google"),
 * through the dashboard's own service account in the MCC — no bot or laptop needed.
 * Leads = conversions of the actions declared in the project's «lead_actions» (what the owner calls a request),
 * not the raw «Conversions» column. The last `days` days are replaced: Google revises recent conversions.
 * A project with no Google rows yet gets 180 days of history.
 */
export async function syncGoogleProject(projectId: string, days = 7): Promise<string> {
  if (!adsConfigured()) throw new Error("Google Ads API не настроен.");
  const db = getDb();
  const [project] = await db
    .select({ sources: projects.sources, leadActions: projects.leadActions })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Проект не найден.");
  const accounts = [
    ...new Set(project.sources.filter((s) => s.platform === "google" && s.accountId).map((s) => s.accountId.replace(/\D/g, ""))),
  ];
  if (!accounts.length) return "нет кабинетов Google";

  // History is loaded once: until the oldest Google row is older than the bot's 7-day window, take 180 days.
  // (The bot also writes the last 7 days, so «there are rows» alone does not mean the history is there.)
  const [{ first }] = await db
    .select({ first: sql<string | null>`min(${adMetricsDaily.date})::text` })
    .from(adMetricsDaily)
    .where(and(eq(adMetricsDaily.projectId, projectId), eq(adMetricsDaily.platform, "google")));
  const span = first && first < iso(Date.now() - 8 * DAY) ? days : 180;
  const until = iso(Date.now());
  const since = iso(Date.now() - (span - 1) * DAY);
  const declared = new Set((project.leadActions ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean));

  const parts: string[] = [];
  for (const accountId of accounts) {
    // Two queries: the split by conversion action multiplies rows and would spoil impressions and clicks.
    const base = new Map<string, { date: string; campaignId: string; name: string; spend: number; impressions: number; clicks: number; leads: number }>();
    const rows: Row[] = await gaql(
      accountId,
      `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks
       FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`,
    );
    for (const r of rows) {
      const date = str(r.segments?.date);
      const campaignId = str(r.campaign?.id);
      base.set(`${date}|${campaignId}`, {
        date,
        campaignId,
        name: str(r.campaign?.name),
        spend: num(r.metrics?.costMicros) / 1e6,
        impressions: Math.round(num(r.metrics?.impressions)),
        clicks: Math.round(num(r.metrics?.clicks)),
        leads: 0,
      });
    }
    if (declared.size) {
      const conv: Row[] = await gaql(
        accountId,
        `SELECT campaign.id, segments.date, segments.conversion_action_name, metrics.conversions
         FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}' AND metrics.conversions > 0`,
      );
      for (const r of conv) {
        if (!declared.has(str(r.segments?.conversionActionName).trim().toLowerCase())) continue;
        const hit = base.get(`${str(r.segments?.date)}|${str(r.campaign?.id)}`);
        if (hit) hit.leads += num(r.metrics?.conversions);
      }
    }

    const values = [...base.values()].map((v) => ({
      date: v.date,
      platform: "google" as const,
      accountId,
      campaignId: v.campaignId,
      campaignName: v.name,
      projectId,
      spend: Math.round(v.spend * 100) / 100,
      impressions: v.impressions,
      clicks: v.clicks,
      leads: Math.round(v.leads * 100) / 100,
      syncedAt: new Date(),
    }));
    // Replace the window: a campaign that dropped to zero must not keep its old numbers.
    await db.transaction(async (tx) => {
      await tx
        .delete(adMetricsDaily)
        .where(
          and(
            eq(adMetricsDaily.platform, "google"),
            eq(adMetricsDaily.accountId, accountId),
            gte(adMetricsDaily.date, since),
            lte(adMetricsDaily.date, until),
          ),
        );
      for (let i = 0; i < values.length; i += 500) await tx.insert(adMetricsDaily).values(values.slice(i, i + 500)).onConflictDoNothing();
    });
    const spend = values.reduce((a, v) => a + v.spend, 0);
    parts.push(`${accountId}: ${values.length} строк за ${since} — ${until}, расход ${Math.round(spend * 100) / 100}`);
  }
  return parts.join(" · ");
}

/** Cron: every non-archived project with a Google Ads account. */
export async function syncAllGoogle() {
  if (!adsConfigured()) return [];
  const list = await getDb().select({ id: projects.id, status: projects.status, sources: projects.sources }).from(projects);
  const results: { projectId: string; kind: string; ok: boolean; message: string }[] = [];
  for (const p of list) {
    if (p.status === "archived" || !p.sources.some((s) => s.platform === "google" && s.accountId)) continue;
    try {
      results.push({ projectId: p.id, kind: "google_ads", ok: true, message: await syncGoogleProject(p.id) });
    } catch (error) {
      results.push({ projectId: p.id, kind: "google_ads", ok: false, message: (error as Error).message });
    }
  }
  return results;
}

/**
 * Called after the «Реклама» page is sent: when the project's Google numbers are older than `maxAgeMs`
 * (or there are none yet), pull the last days again. The page's data cache lives minutes, so the next view shows them.
 */
export async function refreshGoogleIfStale(projectId: string, sources: { platform: string; accountId: string }[], maxAgeMs = 3600_000) {
  if (!adsConfigured() || !sources.some((s) => s.platform === "google" && s.accountId)) return;
  const [row] = await getDb()
    .select({ last: sql<string | null>`max(${adMetricsDaily.syncedAt})`, first: sql<string | null>`min(${adMetricsDaily.date})::text` })
    .from(adMetricsDaily)
    .where(and(eq(adMetricsDaily.projectId, projectId), eq(adMetricsDaily.platform, "google")));
  // The bot refreshes the last 7 days every hour, so «fresh» alone is not enough: the history may still be missing.
  const historyLoaded = !!row?.first && row.first < iso(Date.now() - 8 * DAY);
  if (historyLoaded && row?.last && Date.now() - new Date(row.last).getTime() < maxAgeMs) return;
  await syncGoogleProject(projectId, 3).catch((e) => console.error("google refresh", projectId, (e as Error).message));
}
