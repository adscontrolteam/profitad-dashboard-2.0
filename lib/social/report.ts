import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { socialConnections, socialMetricsDaily, socialPosts, type SocialAudience } from "@/db/schema";
import { manychatEventsIn, manychatStatus } from "@/lib/manychat/store";
import { datesIn, type SmmPost, type SmmReport } from "@/lib/workspace/demo";
import { shiftIso } from "@/lib/workspace/params";

export type LiveNetwork = "facebook" | "instagram" | "threads";
export const isLiveNetwork = (v: string): v is LiveNetwork => v === "facebook" || v === "instagram" || v === "threads";

/** Everything the analytics tabs draw, already cut to the chosen period. Plain data: it crosses to the browser. */
export interface SmmAnalyticsData {
  network: LiveNetwork;
  handle: string;
  followers: number;
  days: { date: string; views: number; reach: number; follows: number | null; unfollows: number | null }[];
  posts: {
    id: string;
    title: string;
    date: string;
    kind: SmmPost["kind"];
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    thumbnailUrl: string | null;
    permalink: string | null;
  }[];
  /** The same numbers of the period right before; null where we hold no data for it. */
  prev: { views: number | null; reach: number | null; interactions: number | null; postViews: number | null; saves: number | null; shares: number | null };
  /** Instagram: views by content type and by follower / non-follower; null when not loaded. */
  byType: Record<string, number> | null;
  byFollower: Record<string, number> | null;
  linkTaps: number | null;
  profileViews: number | null;
  audience: SocialAudience | null;
  dailyViews: boolean;
  /** Funnel steps reported by ManyChat automations in the period; `connected` is false until the first one ever arrives. */
  messages: {
    connected: boolean;
    funnels: { keyword: string; start: number; contact: number; lead: number }[];
    /** Funnel starts by weekday (Mon first) and three-hour slot, Warsaw time. */
    heat: number[][];
    /** Publications by the funnel starts within 48 hours after them. */
    posts: { id: string; title: string; kind: SmmPost["kind"]; date: string; count: number }[];
    /** What people wrote when it was not the code word itself. */
    texts: { text: string; count: number }[];
  };
}

export interface LiveSmmReport extends SmmReport {
  analytics: SmmAnalyticsData;
  /** When the numbers were last pulled; null = never yet. */
  syncedAt: string | null;
  /** Why the last pull failed, if it did. */
  error: string | null;
  /** False while the network gives no per-day views and the chart is built from publications. */
  dailyViews: boolean;
  /** Accounts that unfollowed in the period; null when the network did not report it. */
  unfollows: number | null;
  /** New followers in the period, before the unfollows; null when not reported. */
  newFollowers: number | null;
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
  const left = windowDaily.filter((d) => d.unfollows !== null);
  const snapshots = windowDaily.filter((d) => d.followers !== null).sort((a, b) => a.date.localeCompare(b.date));
  const newFollowers = follows.length ? follows.reduce((a, d) => a + (d.follows ?? 0), 0) : null;
  const unfollows = left.length ? left.reduce((a, d) => a + (d.unfollows ?? 0), 0) : null;
  const followersDelta =
    newFollowers !== null ? newFollowers - (unfollows ?? 0) : snapshots.length > 1 ? (snapshots.at(-1)!.followers ?? 0) - (snapshots[0].followers ?? 0) : 0;

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

  const toPost = (p: (typeof posts)[number]) => ({
    id: p.postId,
    title: p.title || "Без подписи",
    date: day(p.publishedAt),
    kind: KIND[p.kind] ?? ("Пост" as const),
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    saves: p.saves,
    thumbnailUrl: p.thumbnailUrl,
    permalink: p.permalink,
  });
  const before = posts.filter((p) => !inWindow(day(p.publishedAt)));
  const prevDaily = daily.filter((d) => !inWindow(d.date));
  const total = (rows: typeof daily, pick: (d: (typeof daily)[number]) => number | null | undefined) =>
    rows.some((d) => pick(d) != null) ? rows.reduce((a, d) => a + (pick(d) ?? 0), 0) : null;
  const merged = (pick: (d: (typeof daily)[number]) => Record<string, number> | undefined) => {
    const out: Record<string, number> = {};
    for (const d of windowDaily) for (const [k, v] of Object.entries(pick(d) ?? {})) out[k] = (out[k] ?? 0) + v;
    return Object.keys(out).length ? out : null;
  };
  // ManyChat: what the automations reported in the period.
  const [mcStatus, events] = await Promise.all([
    manychatStatus(projectId),
    manychatEventsIn(projectId, new Date(`${window.from}T00:00:00Z`), new Date(`${window.to}T23:59:59Z`)),
  ]);
  const funnelMap = new Map<string, { keyword: string; start: number; contact: number; lead: number }>();
  const heat = Array.from({ length: 7 }, () => Array<number>(8).fill(0));
  const postCounts = new Map<string, number>();
  const textCounts = new Map<string, number>();
  const warsaw = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short", hour: "2-digit", hour12: false });
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const e of events) {
    const f = funnelMap.get(e.keyword) ?? { keyword: e.keyword, start: 0, contact: 0, lead: 0 };
    f[e.step] += 1;
    funnelMap.set(e.keyword, f);
    if (e.step !== "start") continue;
    const parts = warsaw.formatToParts(e.receivedAt);
    const weekday = WEEKDAYS.indexOf(parts.find((x) => x.type === "weekday")?.value ?? "");
    const hour = Number(parts.find((x) => x.type === "hour")?.value ?? 0) % 24;
    if (weekday >= 0) heat[weekday][Math.floor(hour / 3)] += 1;
    // The publication that most likely caused it: the latest one of the two days before, the one naming the word first.
    const at = e.receivedAt.getTime();
    const near = posts.filter((p) => p.publishedAt.getTime() <= at && at - p.publishedAt.getTime() <= 48 * 3600_000).sort((x, y) => y.publishedAt.getTime() - x.publishedAt.getTime());
    const cause = near.find((p) => p.title.toUpperCase().includes(e.keyword)) ?? near[0];
    if (cause) postCounts.set(cause.postId, (postCounts.get(cause.postId) ?? 0) + 1);
    const said = e.lastInput.trim().toLowerCase().slice(0, 80);
    if (said && said.toUpperCase() !== e.keyword) textCounts.set(said, (textCounts.get(said) ?? 0) + 1);
  }
  const messages: SmmAnalyticsData["messages"] = {
    connected: mcStatus.count > 0,
    funnels: [...funnelMap.values()].sort((x, y) => y.start - x.start || y.lead - x.lead),
    heat,
    posts: [...postCounts.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .flatMap(([id, count]) => {
        const p = posts.find((x) => x.postId === id);
        return p ? [{ id, title: p.title || "Без подписи", kind: KIND[p.kind] ?? ("Пост" as const), date: day(p.publishedAt), count }] : [];
      }),
    texts: [...textCounts.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([text, count]) => ({ text, count })),
  };

  const analytics: SmmAnalyticsData = {
    network,
    handle: account.name,
    followers: lastTotal?.followers ?? 0,
    days: dates.map((date) => {
      const d = dailyByDate.get(date);
      return { date, views: dailyViews ? (d?.views ?? 0) : postViews(current, date), reach: d?.reach ?? 0, follows: d?.follows ?? null, unfollows: d?.unfollows ?? null };
    }),
    posts: current.map(toPost),
    prev: {
      views: total(prevDaily, (d) => d.views),
      reach: total(prevDaily, (d) => d.reach),
      interactions: before.length ? before.reduce((a, p) => a + p.likes + p.comments + p.shares + p.saves, 0) : null,
      postViews: before.length ? before.reduce((a, p) => a + p.views, 0) : null,
      saves: before.length ? before.reduce((a, p) => a + p.saves, 0) : null,
      shares: before.length ? before.reduce((a, p) => a + p.shares, 0) : null,
    },
    byType: merged((d) => d.extra?.byType),
    byFollower: merged((d) => d.extra?.byFollower),
    linkTaps: total(windowDaily, (d) => d.extra?.linkTaps),
    profileViews: total(windowDaily, (d) => d.extra?.profileViews),
    audience: account.audience ?? null,
    dailyViews,
    messages,
  };

  return {
    analytics,
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
    unfollows,
    newFollowers,
  };
}
