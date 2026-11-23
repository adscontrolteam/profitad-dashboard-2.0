import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { socialConnections, socialMetricsDaily, socialPosts } from "@/db/schema";
import { datesIn, type SmmPost, type SmmReport } from "@/lib/workspace/demo";
import { shiftIso } from "@/lib/workspace/params";

export type LiveNetwork = "facebook" | "instagram" | "threads";
export const isLiveNetwork = (v: string): v is LiveNetwork => v === "facebook" || v === "instagram" || v === "threads";

export interface LiveSmmReport extends SmmReport {
  /** When the numbers were last pulled; null = never yet. */
  syncedAt: string | null;
  /** Why the last pull failed, if it did. */
  error: string | null;
  /** False while the network gives no per-day views and the chart is built from publications. */
  dailyViews: boolean;
}

const KIND: Record<string, SmmPost["kind"]> = { reel: "Рилс", carousel: "Карусель", video: "Видео", post: "Пост", thread: "Тред" };
const day = (d: Date) => d.toISOString().slice(0, 10);
const hue = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/**
 * The SMM report of a project's connected account, from what the sync stored. Null = no working account of this network.
 * Likes, comments, reposts and saves are those of the publications made in the period (as the tiles say);
 * views per day come from the account statistics when the network gives them, otherwise from the publications of that day.
 */
export async function liveSmmReport(projectId: string, network: LiveNetwork, window: { from: string; to: string }): Promise<LiveSmmReport | null> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(socialConnections)
    .where(and(eq(socialConnections.projectId, projectId), eq(socialConnections.network, network), eq(socialConnections.status, "ok")))
    .orderBy(asc(socialConnections.connectedAt))
    .limit(1);
  if (!account) return null;

  const dates = datesIn(window);
  const prevFrom = shiftIso(window.from, -dates.length);
  const where = [eq(socialMetricsDaily.projectId, projectId), eq(socialMetricsDaily.network, network), eq(socialMetricsDaily.accountId, account.externalId)];
  const [daily, posts, [lastTotal]] = await Promise.all([
    db
      .select()
      .from(socialMetricsDaily)
      .where(and(...where, gte(socialMetricsDaily.date, prevFrom), lte(socialMetricsDaily.date, window.to))),
    db
      .select()
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.projectId, projectId),
          eq(socialPosts.network, network),
          eq(socialPosts.accountId, account.externalId),
          gte(socialPosts.publishedAt, new Date(`${prevFrom}T00:00:00Z`)),
          lte(socialPosts.publishedAt, new Date(`${window.to}T23:59:59Z`)),
        ),
      ),
    db
      .select({ followers: socialMetricsDaily.followers })
      .from(socialMetricsDaily)
      .where(and(...where, gte(socialMetricsDaily.followers, 0)))
      .orderBy(asc(socialMetricsDaily.date))
      .then((rows) => rows.slice(-1)),
  ]);

  const dailyByDate = new Map(daily.map((d) => [d.date, d]));
  const inWindow = (date: string) => date >= window.from && date <= window.to;
  const current = posts.filter((p) => inWindow(day(p.publishedAt)));
  const dailyViews = daily.some((d) => inWindow(d.date) && d.views !== null);
  const postViews = (list: typeof posts, date: string) => list.filter((p) => day(p.publishedAt) === date).reduce((a, p) => a + p.views, 0);

  const days = dates.map((date) => {
    const mine = current.filter((p) => day(p.publishedAt) === date);
    return {
      date,
      views: dailyViews ? (dailyByDate.get(date)?.views ?? 0) : postViews(current, date),
      likes: mine.reduce((a, p) => a + p.likes, 0),
      comments: mine.reduce((a, p) => a + p.comments, 0),
      posts: mine.length,
    };
  });
  const prevDates = datesIn({ from: prevFrom, to: shiftIso(window.from, -1) });
  const prevHasDaily = daily.some((d) => !inWindow(d.date) && d.views !== null);
  const prevViews = prevDates.reduce((a, date) => a + (dailyViews && prevHasDaily ? (dailyByDate.get(date)?.views ?? 0) : dailyViews ? 0 : postViews(posts, date)), 0);

  // Growth: the network's own «new followers» when it reports them, otherwise the change between our snapshots in the period.
  const windowDaily = daily.filter((d) => inWindow(d.date));
  const follows = windowDaily.filter((d) => d.follows !== null);
  const snapshots = windowDaily.filter((d) => d.followers !== null).sort((a, b) => a.date.localeCompare(b.date));
  const followersDelta = follows.length
    ? follows.reduce((a, d) => a + (d.follows ?? 0), 0)
    : snapshots.length > 1
      ? (snapshots.at(-1)!.followers ?? 0) - (snapshots[0].followers ?? 0)
      : 0;

  const top = [...current]
    .sort((a, b) => b.views - a.views || b.likes - a.likes)
    .slice(0, 5)
    .map((p) => ({
      id: p.postId,
      title: p.title || "Без подписи",
      date: day(p.publishedAt),
      kind: KIND[p.kind] ?? "Пост",
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      hue: hue(p.postId),
      thumbnailUrl: p.thumbnailUrl,
      permalink: p.permalink,
    }));

  return {
    connected: true,
    handle: account.name,
    followers: lastTotal?.followers ?? 0,
    followersDelta,
    days,
    prevViews,
    shares: current.reduce((a, p) => a + p.shares, 0),
    saves: current.reduce((a, p) => a + p.saves, 0),
    top,
    syncedAt: account.statsSyncedAt?.toISOString() ?? null,
    error: account.statsError,
    dailyViews,
  };
}
