/** Shared query params of the Ads and SMM workspaces: `?p=<projectId>&range=week&net=threads`. */

/** Calendar periods: this week (Monday–Sunday), this month, the previous month. */
export const RANGES = [
  { value: "week", label: "Неделя", phrase: "за эту неделю" },
  { value: "month", label: "Месяц", phrase: "за этот месяц" },
  { value: "prev", label: "Прошлый месяц", phrase: "за прошлый месяц" },
] as const;

export const DEFAULT_RANGE: (typeof RANGES)[number]["value"] = "month";

export type RangeValue = (typeof RANGES)[number]["value"];

/** Longest custom range, to keep queries and charts reasonable. */
export const MAX_RANGE_DAYS = 730;

export interface Period {
  /** Preset value, or null for a custom from–to range. */
  preset: RangeValue | null;
  from: string;
  to: string;
  days: number;
  /** «Месяц» or «14 окт. — 20 окт.» */
  label: string;
  /** For sentences: «за этот месяц» or «14 окт. — 20 окт.» */
  phrase: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

export const todayIso = () => isoDay(new Date());

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
}

export function shiftIso(iso: string, days: number) {
  return isoDay(new Date(Date.parse(iso) + days * DAY));
}

/** `?from=&to=` wins over `?range=`; invalid or reversed dates fall back to the preset. */
export function parsePeriod(range: unknown, from: unknown, to: unknown): Period {
  const today = todayIso();
  if (typeof from === "string" && typeof to === "string" && ISO_DATE.test(from) && ISO_DATE.test(to)) {
    let start = from <= to ? from : to;
    let end = from <= to ? to : from;
    if (end > today) end = today;
    if (start > end) start = end;
    if (daysBetween(start, end) > MAX_RANGE_DAYS) start = shiftIso(end, -(MAX_RANGE_DAYS - 1));
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const fmt = (iso: string) => shortDate.format(new Date(iso)) + (sameYear ? "" : ` ${iso.slice(0, 4)}`);
    const label = `${fmt(start)} — ${fmt(end)}`;
    return { preset: null, from: start, to: end, days: daysBetween(start, end), label, phrase: label };
  }
  const preset = RANGES.find((r) => r.value === range) ?? RANGES.find((r) => r.value === DEFAULT_RANGE)!;
  let start: string;
  let end = today;
  if (preset.value === "week") {
    // Monday of the current week; the week runs to Sunday, data exists up to today.
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    start = shiftIso(today, -weekday);
  } else if (preset.value === "prev") {
    const firstOfThis = `${today.slice(0, 7)}-01`;
    end = shiftIso(firstOfThis, -1);
    start = `${end.slice(0, 7)}-01`;
  } else {
    start = `${today.slice(0, 7)}-01`;
  }
  return { preset: preset.value, from: start, to: end, days: daysBetween(start, end), label: preset.label, phrase: preset.phrase };
}

export const SOCIAL_NETWORKS = [
  { id: "instagram", label: "Instagram" },
  { id: "threads", label: "Threads" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube Shorts" },
] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]["id"];

export const isSocialNetwork = (v: unknown): v is SocialNetwork =>
  SOCIAL_NETWORKS.some((n) => n.id === v);

export const AD_PLATFORMS = [
  { id: "all", label: "Все" },
  { id: "meta", label: "Meta Ads" },
  { id: "google", label: "Google Ads" },
] as const;

export type AdPlatformFilter = (typeof AD_PLATFORMS)[number]["id"];

export const isAdPlatform = (v: unknown): v is AdPlatformFilter => AD_PLATFORMS.some((p) => p.id === v);

/** Builds a workspace URL keeping the current selection. */
export function workspaceHref(
  path: string,
  current: Record<string, string | undefined>,
  patch: Record<string, string | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...patch })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
