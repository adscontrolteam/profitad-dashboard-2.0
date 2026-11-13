/**
 * Demo numbers for the Ads and SMM workspaces until the platform APIs are connected.
 * Deterministic per project, so a page looks the same on every reload.
 */
import { shiftIso, type SocialNetwork } from "./params";

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DateWindow {
  from: string;
  to: string;
}

function datesIn({ from, to }: DateWindow) {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftIso(d, 1)) out.push(d);
  return out;
}

/** Day number since epoch: drives the smooth waves, so any window of dates is stable. */
const dayIndex = (date: string) => Math.floor(Date.parse(date) / 86_400_000);
/** Stable 0..1 noise per key. */
const noise = (key: string) => hash(key) / 4294967296;

/* ---------- Ads ---------- */

export type CampaignStatus = "active" | "paused" | "learning";

export interface AdDay {
  date: string;
  spend: number;
  results: number;
  impressions: number;
  clicks: number;
}

export interface AdCampaign {
  id: string;
  name: string;
  platform: "meta" | "google";
  status: CampaignStatus | null;
  spend: number;
  results: number;
  impressions: number;
  clicks: number;
  /** null when the source does not report reach. */
  frequency: number | null;
}

export interface AdsReport {
  source: "demo" | "synced";
  days: AdDay[];
  campaigns: AdCampaign[];
  reach: number | null;
}

const CAMPAIGN_STEMS = ["Quiz_CONV", "Lead_Form", "Retarget_7d", "Video_Views", "Search_Brand", "PMax_Sales"];
const GEOS = ["ES", "IT", "PL", "DE", "UA"];

export function demoAdsReport(
  projectId: string,
  projectName: string,
  window: DateWindow,
  platform: "all" | "meta" | "google",
): AdsReport {
  const r = rng(`ads:${projectId}`);
  const prefix = projectName.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 14) || "Project";
  const base = 40 + r() * 140;
  const cpr = 0.8 + r() * 2.4;

  const campaignCount = 4 + Math.floor(r() * 3);
  const shares = Array.from({ length: campaignCount }, () => 0.2 + r());
  const shareSum = shares.reduce((a, b) => a + b, 0);

  const allCampaigns = shares.map((share, i) => {
    const isGoogle = CAMPAIGN_STEMS[i % CAMPAIGN_STEMS.length].startsWith("Search") || CAMPAIGN_STEMS[i % CAMPAIGN_STEMS.length].startsWith("PMax");
    const name = `${prefix}_${GEOS[i % GEOS.length]}_${CAMPAIGN_STEMS[i % CAMPAIGN_STEMS.length]}${i > 2 ? "_v2" : ""}`;
    const roll = r();
    return {
      id: `c${i}`,
      name,
      platform: (isGoogle ? "google" : "meta") as "meta" | "google",
      status: (roll > 0.82 ? "paused" : roll > 0.72 ? "learning" : "active") as CampaignStatus,
      weight: share / shareSum,
      cprFactor: 0.7 + r() * 0.9,
      ctr: 0.011 + r() * 0.018,
      cpm: 2.4 + r() * 4,
      frequency: 1.2 + r() * 1.2,
    };
  });

  const campaignsIn = allCampaigns.filter((c) => platform === "all" || c.platform === platform);
  const weightSum = campaignsIn.reduce((a, c) => a + c.weight, 0);

  const series = datesIn(window).map((date) => {
    const i = dayIndex(date);
    const wave = 1 + 0.35 * Math.sin(i / 9) + 0.2 * Math.sin(i / 3.3);
    return { date, factor: Math.max(0.15, wave * (0.6 + noise(`ads:${projectId}:${date}`) * 0.8)) };
  });

  const daysOut: AdDay[] = series.map(({ date, factor }) => {
    const spend = base * factor * weightSum;
    const results = Math.round(spend / (cpr * (0.8 + ((hash(date) % 40) / 100))));
    const impressions = Math.round((spend / 3.6) * 1000);
    const clicks = Math.round(impressions * 0.02);
    return { date, spend: round2(spend), results, impressions, clicks };
  });

  const totalSpend = daysOut.reduce((a, d) => a + d.spend, 0);
  const campaigns: AdCampaign[] = campaignsIn.map((c) => {
    const spend = (totalSpend * c.weight) / (weightSum || 1);
    const impressions = Math.round((spend / c.cpm) * 1000);
    return {
      id: c.id,
      name: c.name,
      platform: c.platform,
      status: c.status,
      spend: round2(spend),
      results: Math.round(spend / (cpr * c.cprFactor)),
      impressions,
      clicks: Math.round(impressions * c.ctr),
      frequency: round2(c.frequency),
    };
  });

  const impressions = daysOut.reduce((a, d) => a + d.impressions, 0);
  return { source: "demo", days: daysOut, campaigns, reach: Math.round(impressions / 2.1) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/* ---------- SMM ---------- */

export interface SmmDay {
  date: string;
  views: number;
  likes: number;
  comments: number;
  posts: number;
}

export interface SmmPost {
  id: string;
  title: string;
  date: string;
  kind: "Рилс" | "Пост" | "Тред" | "Видео" | "Карусель";
  views: number;
  likes: number;
  comments: number;
  shares: number;
  hue: number;
}

export interface SmmReport {
  connected: boolean;
  handle: string;
  followers: number;
  followersDelta: number;
  days: SmmDay[];
  prevViews: number;
  shares: number;
  saves: number;
  top: SmmPost[];
}

const POST_TITLES = [
  "Агент сам запустил рекламу за вечер — разбор кейса",
  "Instagram начал платить за фото и карусели",
  "Как мы сократили цену лида в 2 раза",
  "Meta переписала алгоритм показа рекламы",
  "Сколько на самом деле стоит таргетолог в 2026",
  "5 креативов, которые зашли в этом месяце",
  "Threads открыл рекламу для всех стран",
  "Ошибка, которая сливает бюджет в первые 3 дня",
];

const KIND_BY_NETWORK: Record<SocialNetwork, SmmPost["kind"][]> = {
  instagram: ["Рилс", "Карусель", "Пост"],
  threads: ["Тред", "Пост"],
  facebook: ["Пост", "Видео"],
  tiktok: ["Видео"],
  youtube: ["Видео"],
};

/** Networks with a demo connection per project; the rest show «Подключить». */
export function demoConnectedNetworks(projectId: string): SocialNetwork[] {
  const r = rng(`net:${projectId}`);
  const out: SocialNetwork[] = ["instagram", "threads"];
  if (r() > 0.4) out.push("facebook");
  if (r() > 0.6) out.push("tiktok");
  return out;
}

export function demoSmmReport(
  projectId: string,
  projectName: string,
  network: SocialNetwork,
  window: DateWindow,
): SmmReport {
  const connected = demoConnectedNetworks(projectId).includes(network);
  const r = rng(`smm:${projectId}:${network}`);
  const handle = `@${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand"}${network === "threads" ? ".threads" : ""}`;
  const scale = network === "instagram" ? 1400 : network === "tiktok" ? 2200 : network === "threads" ? 420 : 300;
  const base = scale * (0.4 + r());

  const day = (date: string): SmmDay => {
    const d = rng(`smm:${projectId}:${network}:${date}`);
    const spike = d() > 0.93 ? 3 + d() * 5 : 1;
    const views = Math.round(base * (0.3 + d() * 0.9) * spike * Math.max(0.4, 1 + (dayIndex(date) - 20000) / 900));
    const posts = d() > 0.55 ? 1 + Math.floor(d() * 2) : 0;
    return {
      date,
      views,
      likes: Math.round(views * (0.008 + d() * 0.02)),
      comments: Math.round(views * (0.001 + d() * 0.004)),
      posts,
    };
  };

  const current = datesIn(window).map(day);
  const length = current.length;
  const prev = datesIn({ from: shiftIso(window.from, -length), to: shiftIso(window.from, -1) }).map(day);
  const followers = Math.round(base * 3.2 + r() * 4000);
  const top = Array.from({ length: 5 }, (_, i) => {
    const views = Math.round(base * (6 - i) * (1.6 + r() * 1.2));
    const kinds = KIND_BY_NETWORK[network];
    const d = current[Math.floor(r() * current.length)]?.date ?? current[0].date;
    return {
      id: `${network}-${i}`,
      title: POST_TITLES[(hash(projectId) + i * 3) % POST_TITLES.length],
      date: d,
      kind: kinds[i % kinds.length],
      views,
      likes: Math.round(views * (0.01 + r() * 0.02)),
      comments: Math.round(views * 0.003),
      shares: Math.round(views * 0.002),
      hue: Math.floor(r() * 360),
    } satisfies SmmPost;
  }).sort((a, b) => b.views - a.views);

  const viewsSum = current.reduce((a, d) => a + d.views, 0);
  return {
    connected,
    handle,
    followers,
    followersDelta: Math.round(followers * (0.01 + r() * 0.06)),
    days: current,
    prevViews: prev.reduce((a, d) => a + d.views, 0),
    shares: Math.round(viewsSum * 0.0021),
    saves: Math.round(viewsSum * 0.0034),
    top,
  };
}
