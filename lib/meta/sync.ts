import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, projects } from "@/db/schema";
import { campaignInsights, metaConfigured } from "./ads";
import { countLeads, countSubscribers } from "./results";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Pulls Meta campaign × day stats of every Meta ad account of the project into ad_metrics_daily (platform "meta").
 * The last `days` days are replaced (Meta revises recent conversions); a project with no Meta rows yet gets 180 days.
 */
export async function syncMetaProject(projectId: string, days = 3): Promise<string> {
  if (!metaConfigured()) throw new Error("Meta не подключена: нет META_SYSTEM_USER_TOKEN.");
  const db = getDb();
  const [project] = await db
    .select({ sources: projects.sources, metaActions: projects.metaActions })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Проект не найден.");
  const accounts = project.sources.filter((s) => s.platform === "meta" && s.accountId).map((s) => s.accountId.replace(/\D/g, ""));
  if (!accounts.length) return "нет кабинетов Meta";

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(adMetricsDaily)
    .where(and(eq(adMetricsDaily.projectId, projectId), eq(adMetricsDaily.platform, "meta")));
  const span = Number(n) > 0 ? days : 180;
  const until = iso(Date.now());
  const since = iso(Date.now() - (span - 1) * DAY);
  const chosen = { leads: project.metaActions?.leads ?? [], subscribers: project.metaActions?.subscribers ?? [] };

  const parts: string[] = [];
  for (const accountId of accounts) {
    const rows = await campaignInsights(accountId, since, until);
    const values = rows.map((r) => ({
      date: r.date_start,
      platform: "meta" as const,
      accountId,
      campaignId: r.campaign_id,
      campaignName: r.campaign_name ?? "",
      projectId,
      spend: Number(r.spend ?? 0),
      impressions: Math.round(Number(r.impressions ?? 0)),
      clicks: Math.round(Number(r.inline_link_clicks ?? 0)),
      leads: countLeads(r.actions, chosen.leads),
      subscribers: countSubscribers(r.actions, chosen.subscribers),
      syncedAt: new Date(),
    }));
    // Replace the window: a campaign that dropped to zero must not keep its old numbers.
    await db.transaction(async (tx) => {
      await tx
        .delete(adMetricsDaily)
        .where(
          and(
            eq(adMetricsDaily.platform, "meta"),
            eq(adMetricsDaily.accountId, accountId),
            eq(adMetricsDaily.projectId, projectId),
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

/** Cron: every non-archived project with a Meta ad account. */
export async function syncAllMeta() {
  if (!metaConfigured()) return [];
  const list = await getDb().select({ id: projects.id, status: projects.status, sources: projects.sources }).from(projects);
  const results: { projectId: string; kind: string; ok: boolean; message: string }[] = [];
  for (const p of list) {
    if (p.status === "archived" || !p.sources.some((s) => s.platform === "meta" && s.accountId)) continue;
    try {
      results.push({ projectId: p.id, kind: "meta_ads", ok: true, message: await syncMetaProject(p.id) });
    } catch (error) {
      results.push({ projectId: p.id, kind: "meta_ads", ok: false, message: (error as Error).message });
    }
  }
  return results;
}
