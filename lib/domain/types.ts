export const PROJECT_STATUSES = [
  "active",
  "awaiting_feedback",
  "awaiting_offer",
  "need_contact",
  "paused",
  "archived",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const METRIC_KEYS = [
  "spend",
  "impressions",
  "clicks",
  "leads",
  "subscribers",
  "sales",
  "revenue",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

/** Metrics a project can set a result KPI on. */
export const RESULT_METRICS = ["leads", "subscribers", "sales", "revenue"] as const satisfies readonly MetricKey[];
export type ResultMetric = (typeof RESULT_METRICS)[number];

/** Missing key = no data yet (shown as «—»), not zero. */
export type Metrics = Partial<Record<MetricKey, number>>;

/** ISO date string, `YYYY-MM-DD`. */
export type IsoDate = string;

export interface Kpi {
  metric: ResultMetric;
  /** Planned amount for the period; null = not set yet. */
  plan: number | null;
  /** Target cost per result unit. */
  cpaPlan: number | null;
}

export const TRAFFIC_PLATFORMS = ["meta", "google", "tiktok"] as const;
export type TrafficPlatform = (typeof TRAFFIC_PLATFORMS)[number];

export interface TrafficSource {
  platform: TrafficPlatform;
  /** Ad account ID on the platform; empty = no access yet. */
  accountId: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  goal: string;
  period: { start: IsoDate; end: IsoDate };
  /** Results tracked for the project; the first one is the primary KPI. */
  kpis: Kpi[];
  sources: TrafficSource[];
  notes: string;
  metrics: Metrics;
}

export interface KpiStats {
  kpi: Kpi;
  fact: number;
  /** fact / plan; null when the plan is not set. */
  progress: number | null;
  /** Projected value at the end of the period at the current pace. */
  forecast: number;
  /** forecast / plan, 1 = on track; null when the plan is not set. */
  pace: number | null;
  cpaFact: number | null;
}

export interface ProjectStats {
  /** Share of the period already elapsed, 0..1 */
  elapsed: number;
  results: KpiStats[];
  /** Stats of the first KPI, used for signals and sorting. */
  primary: KpiStats | null;
}

export interface ProjectWithStats extends Project {
  stats: ProjectStats;
}

export type StatusSummary = Record<ProjectStatus, number>;
