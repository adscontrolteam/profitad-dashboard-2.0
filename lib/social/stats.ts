import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { socialConnections, socialMetricsDaily, socialPosts, type SocialAudience, type SocialConnectionRow, type SocialDayExtra } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

/**
 * Organic statistics of the connected Facebook Pages and Instagram accounts (Graph API, Page token).
 *  - Instagram: account `views`/`reach` and `follows_and_unfollows` exist only as a total for a window, so every
 *    day is asked for separately;
 *    publications come from /media with their own insights (`views`, `saved`, `shares`).
 *  - Facebook: /insights gives days in one call (`page_media_view`, `page_total_media_view_unique`,
 *    `page_daily_follows_unique`, `page_daily_unfollows_unique`); publications come from /published_posts, their views from `post_media_view`.
 * The old `impressions` / `page_impressions` / `page_fans` metrics were removed by Meta in 2025 — do not bring them back.
 * Threads is not read here yet.
 */
const GRAPH = () => `https://graph.facebook.com/${process.env.META_API_VERSION || "v24.0"}`;
const DAY = 86_400_000;
const iso = (t: number | Date) => new Date(t).toISOString().slice(0, 10);
const FIRST_DAYS = 30;
const NEXT_DAYS = 3;
/** Publications older than this are not refreshed any more. */
const POSTS_DAYS = 90;

class GraphError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

async function graph<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH()}/${path}?${new URLSearchParams({ ...params, access_token: token, ...proof(token) })}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || data.error) throw new GraphError(data.error?.message ?? `HTTP ${res.status}`, data.error?.code);
  return data;
}

function proof(token: string): Record<string, string> {
  const secret = process.env.META_APP_SECRET;
  return secret ? { appsecret_proof: createHmac("sha256", secret).update(token).digest("hex") } : {};
}

/** Runs the jobs a few at a time: Meta throttles bursts. */
async function pool<I, O>(items: I[], size: number, job: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(job))));
  return out;
}

interface DayRow {
  date: string;
  views: number | null;
  reach: number | null;
  follows: number | null;
  unfollows: number | null;
  extra?: SocialDayExtra | null;
}
interface PostRow {
  postId: string;
  publishedAt: Date;
  kind: string;
  title: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}
interface Pulled {
  followers: number | null;
  days: DayRow[];
  posts: PostRow[];
  audience?: SocialAudience | null;
  /** Parts Meta refused; the rest is still stored. */
  warnings: string[];
}

/* ---------- Instagram ---------- */

async function pullInstagram(id: string, token: string, days: number): Promise<Pulled> {
  const warnings: string[] = [];
  const me = await graph<{ followers_count?: number }>(token, id, { fields: "followers_count" });

  // Yesterday and back: today's numbers are not final and Meta's data lags.
  const dates = Array.from({ length: days }, (_, i) => iso(Date.now() - (i + 1) * DAY));
  let dayFailure: string | null = null;
  let followFailure: string | null = null;
  type Split = { dimension_values?: string[]; value?: number };
  const refused: Partial<Record<"byType" | "byFollower" | "linkTaps" | "profileViews", string>> = {};
  const dayRows = await pool(dates, 5, async (date): Promise<DayRow | null> => {
    const since = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
    try {
      const r = await graph<{ data?: { name: string; total_value?: { value?: number } }[] }>(token, `${id}/insights`, {
        metric: "views,reach",
        period: "day",
        metric_type: "total_value",
        since: String(since),
        until: String(since + 86_400),
      });
      const value = (name: string) => r.data?.find((m) => m.name === name)?.total_value?.value ?? null;
      // Who followed and who left that day: its own call, the breakdown is not allowed next to the other metrics.
      let follows: number | null = null;
      let unfollows: number | null = null;
      try {
        const f = await graph<{ data?: { total_value?: { breakdowns?: { results?: Split[] }[] } }[] }>(token, `${id}/insights`, {
          metric: "follows_and_unfollows",
          period: "day",
          metric_type: "total_value",
          breakdown: "follow_type",
          since: String(since),
          until: String(since + 86_400),
        });
        const parts = f.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
        const of = (type: string) => parts.find((x) => x.dimension_values?.[0] === type)?.value ?? 0;
        follows = of("FOLLOWER");
        unfollows = of("NON_FOLLOWER");
      } catch (error) {
        followFailure = (error as Error).message;
      }
      // The splits the Instagram app shows: each is its own call, and one Meta refuses is not asked for again in this run.
      const extra: SocialDayExtra = {};
      const window = { period: "day", metric_type: "total_value", since: String(since), until: String(since + 86_400) };
      for (const part of ["byType", "byFollower", "linkTaps", "profileViews"] as const) {
        if (refused[part]) continue;
        try {
          if (part === "byType" || part === "byFollower") {
            const b = await graph<{ data?: { total_value?: { breakdowns?: { results?: Split[] }[] } }[] }>(token, `${id}/insights`, {
              metric: "views",
              // Meta's metric table spells it `follower_type` for views, but the API takes only `follow_type` (error #100 otherwise).
              breakdown: part === "byType" ? "media_product_type" : "follow_type",
              ...window,
            });
            const out: Record<string, number> = {};
            for (const x of b.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) if (x.dimension_values?.[0]) out[x.dimension_values[0]] = x.value ?? 0;
            extra[part] = out;
          } else {
            const b = await graph<{ data?: { total_value?: { value?: number } }[] }>(token, `${id}/insights`, {
              metric: part === "linkTaps" ? "profile_links_taps" : "profile_views",
              ...window,
            });
            extra[part] = b.data?.[0]?.total_value?.value ?? 0;
          }
        } catch (error) {
          refused[part] = (error as Error).message;
        }
      }
      return { date, views: value("views"), reach: value("reach"), follows, unfollows, extra };
    } catch (error) {
      dayFailure = (error as Error).message;
      return null;
    }
  });
  if (dayFailure) warnings.push(`просмотры по дням: ${dayFailure}`);
  if (followFailure) warnings.push(`подписки и отписки: ${followFailure}`);
  // Profile visits are not in Meta's current metric table: their absence is expected and not worth a warning.
  const PART_LABEL = { byType: "просмотры по типу контента", byFollower: "подписчики и не подписчики", linkTaps: "переходы по ссылке профиля" } as const;
  for (const part of Object.keys(PART_LABEL) as (keyof typeof PART_LABEL)[]) if (refused[part]) warnings.push(`${PART_LABEL[part]}: ${refused[part]}`);

  // Who the followers are. Meta gives it only to accounts with 100+ followers.
  const audience: SocialAudience = {};
  let audienceFailure: string | null = null;
  for (const group of ["age", "gender", "city"] as const) {
    try {
      const a = await graph<{ data?: { total_value?: { breakdowns?: { results?: Split[] }[] } }[] }>(token, `${id}/insights`, {
        metric: "follower_demographics",
        period: "lifetime",
        metric_type: "total_value",
        breakdown: group,
      });
      const out: Record<string, number> = {};
      for (const x of a.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []) if (x.dimension_values?.[0]) out[x.dimension_values[0]] = x.value ?? 0;
      if (Object.keys(out).length) audience[group] = out;
    } catch (error) {
      audienceFailure = (error as Error).message;
    }
  }
  if (audienceFailure) warnings.push(`аудитория: ${audienceFailure}`);

  interface Media {
    id: string;
    caption?: string;
    media_type?: string;
    media_product_type?: string;
    permalink?: string;
    timestamp: string;
    like_count?: number;
    comments_count?: number;
    thumbnail_url?: string;
    media_url?: string;
  }
  const media: Media[] = [];
  const oldest = Date.now() - POSTS_DAYS * DAY;
  let next: string | undefined;
  for (let page = 0; page < 6; page++) {
    const r: { data?: Media[]; paging?: { next?: string } } = next
      ? await graph(token, next)
      : await graph(token, `${id}/media`, {
          fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url",
          limit: "50",
        });
    const batch = r.data ?? [];
    media.push(...batch.filter((m) => Date.parse(m.timestamp) >= oldest));
    next = r.paging?.next;
    if (!next || batch.some((m) => Date.parse(m.timestamp) < oldest)) break;
  }

  let insightFailure: string | null = null;
  const posts = await pool(media, 5, async (m): Promise<PostRow> => {
    let views = 0;
    let saves = 0;
    let shares = 0;
    try {
      const r = await graph<{ data?: { name: string; values?: { value?: number }[] }[] }>(token, `${m.id}/insights`, { metric: "views,saved,shares" });
      const value = (name: string) => r.data?.find((x) => x.name === name)?.values?.[0]?.value ?? 0;
      views = value("views");
      saves = value("saved");
      shares = value("shares");
    } catch (error) {
      insightFailure = (error as Error).message;
    }
    const kind = m.media_product_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : m.media_type === "VIDEO" ? "video" : "post";
    return {
      postId: m.id,
      publishedAt: new Date(m.timestamp),
      kind,
      title: (m.caption ?? "").split("\n")[0].slice(0, 140),
      permalink: m.permalink ?? null,
      thumbnailUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? null : (m.media_url ?? null)),
      views,
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      shares,
      saves,
    };
  });
  if (insightFailure) warnings.push(`просмотры публикаций: ${insightFailure}`);

  return { followers: me.followers_count ?? null, days: dayRows.filter((d): d is DayRow => d !== null), posts, audience: Object.keys(audience).length ? audience : null, warnings };
}

/* ---------- Facebook Page ---------- */

const PAGE_METRICS = {
  page_media_view: "views",
  page_total_media_view_unique: "reach",
  page_daily_follows_unique: "follows",
  page_daily_unfollows_unique: "unfollows",
} as const;

async function pullFacebook(id: string, token: string, days: number): Promise<Pulled> {
  const warnings: string[] = [];
  const me = await graph<{ followers_count?: number }>(token, id, { fields: "followers_count" });

  const window = { period: "day", since: iso(Date.now() - (days + 1) * DAY), until: iso(Date.now()) };
  type Series = { name: string; values?: { value?: number; end_time: string }[] };
  const names = Object.keys(PAGE_METRICS) as (keyof typeof PAGE_METRICS)[];
  let series: Series[] = [];
  try {
    series = (await graph<{ data?: Series[] }>(token, `${id}/insights`, { metric: names.join(","), ...window })).data ?? [];
  } catch {
    // One metric Meta no longer knows fails the whole list: ask for them one by one and keep what answers.
    for (const name of names) {
      try {
        series.push(...((await graph<{ data?: Series[] }>(token, `${id}/insights`, { metric: name, ...window })).data ?? []));
      } catch (error) {
        warnings.push(`${name}: ${(error as Error).message}`);
      }
    }
  }
  const byDate = new Map<string, DayRow>();
  for (const s of series) {
    const field = PAGE_METRICS[s.name as keyof typeof PAGE_METRICS];
    if (!field) continue;
    for (const v of s.values ?? []) {
      // `end_time` closes the day it reports.
      const date = iso(Date.parse(v.end_time) - DAY);
      const row = byDate.get(date) ?? { date, views: null, reach: null, follows: null, unfollows: null };
      row[field] = typeof v.value === "number" ? v.value : null;
      byDate.set(date, row);
    }
  }

  interface Post {
    id: string;
    message?: string;
    created_time: string;
    permalink_url?: string;
    full_picture?: string;
    shares?: { count?: number };
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
  }
  const base = "id,message,created_time,permalink_url,full_picture,shares";
  const reactions = "reactions.summary(total_count).limit(0)";
  const comments = "comments.summary(total_count).limit(0)";
  const since = String(Math.floor((Date.now() - POSTS_DAYS * DAY) / 1000));
  let list: Post[] = [];
  // Comment and reaction counters need rights the token may not have: fall back to what Meta does give.
  const attempts = [`${base},${reactions},${comments}`, `${base},${reactions}`, base];
  for (let i = 0; i < attempts.length; i++) {
    try {
      list = (await graph<{ data?: Post[] }>(token, `${id}/published_posts`, { fields: attempts[i], limit: "100", since })).data ?? [];
      if (i > 0) warnings.push(i === 1 ? "комментарии под постами недоступны этому ключу" : "реакции и комментарии под постами недоступны этому ключу");
      break;
    } catch (error) {
      if (i === attempts.length - 1) warnings.push(`публикации: ${(error as Error).message}`);
    }
  }

  let insightFailure: string | null = null;
  const posts = await pool(list, 5, async (p): Promise<PostRow> => {
    let views = 0;
    try {
      const r = await graph<{ data?: { values?: { value?: number }[] }[] }>(token, `${p.id}/insights`, { metric: "post_media_view" });
      views = r.data?.[0]?.values?.[0]?.value ?? 0;
    } catch (error) {
      insightFailure = (error as Error).message;
    }
    return {
      postId: p.id,
      publishedAt: new Date(p.created_time),
      kind: "post",
      title: (p.message ?? "").split("\n")[0].slice(0, 140),
      permalink: p.permalink_url ?? null,
      thumbnailUrl: p.full_picture ?? null,
      views,
      likes: p.reactions?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      shares: p.shares?.count ?? 0,
      saves: 0,
    };
  });
  if (insightFailure) warnings.push(`просмотры постов: ${insightFailure}`);

  return { followers: me.followers_count ?? null, days: [...byDate.values()], posts, warnings };
}

/* ---------- Store ---------- */

async function store(row: SocialConnectionRow, pulled: Pulled) {
  const db = getDb();
  const key = { projectId: row.projectId, network: row.network, accountId: row.externalId };
  const target = [socialMetricsDaily.projectId, socialMetricsDaily.network, socialMetricsDaily.accountId, socialMetricsDaily.date];
  for (const d of pulled.days) {
    const values = { views: d.views, reach: d.reach, follows: d.follows, unfollows: d.unfollows, ...(d.extra ? { extra: d.extra } : {}), syncedAt: new Date() };
    await db.insert(socialMetricsDaily).values({ ...key, date: d.date, ...values }).onConflictDoUpdate({ target, set: values });
  }
  if (pulled.followers !== null) {
    // Today's row only carries the total we saw; its views arrive tomorrow.
    const values = { followers: pulled.followers, syncedAt: new Date() };
    await db.insert(socialMetricsDaily).values({ ...key, date: iso(Date.now()), ...values }).onConflictDoUpdate({ target, set: values });
  }
  for (const p of pulled.posts) {
    const values = { ...p, accountId: row.externalId, syncedAt: new Date() };
    await db
      .insert(socialPosts)
      .values({ projectId: row.projectId, network: row.network, ...values })
      .onConflictDoUpdate({ target: [socialPosts.projectId, socialPosts.network, socialPosts.postId], set: values });
  }
}

const mine = (row: Pick<SocialConnectionRow, "projectId" | "network" | "externalId">) =>
  and(eq(socialConnections.projectId, row.projectId), eq(socialConnections.network, row.network), eq(socialConnections.externalId, row.externalId));

/** Pulls one account and records how it went on the connection. First run takes a month of days, later ones the last few. */
export async function syncSocialAccount(row: SocialConnectionRow, firstRun: boolean): Promise<{ ok: boolean; message: string }> {
  if (row.network === "threads") return { ok: true, message: "Статистика Threads пока не загружается." };
  const db = getDb();
  try {
    const token = decrypt(row.token);
    const days = firstRun ? FIRST_DAYS : NEXT_DAYS;
    const pulled = row.network === "instagram" ? await pullInstagram(row.externalId, token, days) : await pullFacebook(row.externalId, token, days);
    await store(row, pulled);
    const note = pulled.warnings.length ? `Часть данных Meta не отдала — ${pulled.warnings.join("; ")}` : null;
    await db
      .update(socialConnections)
      .set({ statsSyncedAt: new Date(), statsError: note, ...(pulled.audience ? { audience: pulled.audience } : {}) })
      .where(mine(row));
    return { ok: !note, message: note ?? `дней: ${pulled.days.length}, публикаций: ${pulled.posts.length}` };
  } catch (error) {
    const message = (error as Error).message;
    await db.update(socialConnections).set({ statsSyncedAt: new Date(), statsError: message }).where(mine(row));
    return { ok: false, message };
  }
}

/**
 * Pulls the project's Facebook and Instagram accounts whose numbers are older than `maxAgeMs` (or were never pulled).
 * The claim on `stats_synced_at` lets only one of several open tabs do the work. `force` skips the age check.
 */
export async function refreshSocialStats(projectId: string, { maxAgeMs = 3600_000, force = false } = {}) {
  const db = getDb();
  const rows = await db.select().from(socialConnections).where(and(eq(socialConnections.projectId, projectId), eq(socialConnections.status, "ok")));
  const results: { network: string; name: string; ok: boolean; message: string }[] = [];
  for (const row of rows) {
    if (row.network === "threads") continue;
    const stale = new Date(Date.now() - maxAgeMs);
    const claimed = await db
      .update(socialConnections)
      .set({ statsSyncedAt: sql`now()` })
      .where(and(mine(row), force ? undefined : or(isNull(socialConnections.statsSyncedAt), lt(socialConnections.statsSyncedAt, stale))))
      .returning({ id: socialConnections.externalId });
    if (!claimed.length) continue;
    results.push({ network: row.network, name: row.name, ...(await syncSocialAccount(row, row.statsSyncedAt === null)) });
  }
  return results;
}

/** Nightly: every connected account, the last few days. */
export async function syncAllSocialStats() {
  const projectIds = [...new Set((await getDb().select({ projectId: socialConnections.projectId }).from(socialConnections)).map((r) => r.projectId))];
  const out: { projectId: string; kind: string; ok: boolean; message: string }[] = [];
  for (const projectId of projectIds) {
    for (const r of await refreshSocialStats(projectId, { force: true }).catch(() => []))
      out.push({ projectId, kind: `social_${r.network}`, ok: r.ok, message: `${r.name}: ${r.message}` });
  }
  return out;
}
