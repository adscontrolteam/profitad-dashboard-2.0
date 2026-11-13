import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { adMetricsDaily } from "@/db/schema";
import { TAGS } from "@/lib/data/tags";
import type { ResultMetric } from "@/lib/domain/types";
import { demoAdsReport, type AdCampaign, type AdDay, type AdsReport } from "./demo";
import type { AdPlatformFilter } from "./params";

/**
 * Ads report for a project: real rows from ad_metrics_daily when the sync has written any,
 * otherwise demo numbers so the workspace is usable before the APIs are connected.
 */
export async function getAdsReport(
  project: { id: string; name: string },
  window: { from: string; to: string },
  platform: AdPlatformFilter,
  resultMetric: ResultMetric,
): Promise<AdsReport> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAGS.project(project.id));

  const platforms = platform === "all" ? (["meta", "google", "tiktok"] as const) : [platform];
  const rows = await getDb()
    .select()
    .from(adMetricsDaily)
    .where(
      and(
        eq(adMetricsDaily.projectId, project.id),
        gte(adMetricsDaily.date, window.from),
        lte(adMetricsDaily.date, window.to),
        inArray(adMetricsDaily.platform, [...platforms]),
      ),
    )
    .orderBy(asc(adMetricsDaily.date));

  if (rows.length === 0) return demoAdsReport(project.id, project.name, window, platform);

  const result = (row: (typeof rows)[number]) => Number(row[resultMetric] ?? 0);
  const byDay = new Map<string, AdDay>();
  const byCampaign = new Map<string, AdCampaign>();

  for (const row of rows) {
    const day = byDay.get(row.date) ?? { date: row.date, spend: 0, results: 0, impressions: 0, clicks: 0 };
    day.spend += row.spend;
    day.results += result(row);
    day.impressions += row.impressions;
    day.clicks += row.clicks;
    byDay.set(row.date, day);

    const key = `${row.platform}:${row.campaignId}`;
    const c = byCampaign.get(key) ?? {
      id: key,
      name: row.campaignName || row.campaignId,
      platform: row.platform === "google" ? "google" : "meta",
      status: null,
      spend: 0,
      results: 0,
      impressions: 0,
      clicks: 0,
      frequency: null,
      accountId: row.accountId,
      externalId: row.campaignId,
    };
    c.spend += row.spend;
    c.results += result(row);
    c.impressions += row.impressions;
    c.clicks += row.clicks;
    byCampaign.set(key, c);
  }

  return {
    source: "synced",
    days: [...byDay.values()],
    campaigns: [...byCampaign.values()].sort((a, b) => b.spend - a.spend),
    reach: null,
  };
}
