/** Shared query params of the Ads and SMM workspaces: `?p=<projectId>&range=30&net=threads`. */

export const RANGES = [
  { value: "7", label: "7 дней", days: 7 },
  { value: "30", label: "30 дней", days: 30 },
  { value: "90", label: "90 дней", days: 90 },
  { value: "365", label: "Год", days: 365 },
] as const;

export type RangeValue = (typeof RANGES)[number]["value"];

export function parseRange(value: unknown): (typeof RANGES)[number] {
  return RANGES.find((r) => r.value === value) ?? RANGES[1];
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
