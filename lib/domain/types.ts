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
  /** Goal «Б» — the minimum KPI, 100%. Amount for the period; null = not set yet. Pace is judged against it. */
  plan: number | null;
  /** Target cost per result unit for «Б». */
  cpaPlan: number | null;
  /** Goal «Б+» — overachievement. */
  planPlus?: number | null;
  cpaPlus?: number | null;
  /** Goal «С» — super overachievement. */
  planSuper?: number | null;
  cpaSuper?: number | null;
}

/** Goal levels of a KPI, lowest first: Б = 100% of the plan, Б+ and С above it. */
export const GOAL_LEVELS = [
  { key: "base", label: "Б", plan: "plan", cpa: "cpaPlan" },
  { key: "plus", label: "Б+", plan: "planPlus", cpa: "cpaPlus" },
  { key: "super", label: "С", plan: "planSuper", cpa: "cpaSuper" },
] as const satisfies readonly { key: string; label: string; plan: keyof Kpi; cpa: keyof Kpi }[];

export const TRAFFIC_PLATFORMS = ["meta", "google", "tiktok"] as const;
export type TrafficPlatform = (typeof TRAFFIC_PLATFORMS)[number];

export interface TrafficSource {
  platform: TrafficPlatform;
  /** Ad account ID on the platform; empty = no access yet. */
  accountId: string;
}

/** Plan set for one calendar month. */
export interface MonthPlan {
  /** YYYY-MM */
  month: string;
  kpis: Kpi[];
  budgetMonth: number | null;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  goal: string;
  /** Start of work; results can be viewed for any range from here on. */
  startDate: IsoDate;
  /** The range the numbers below are for (a calendar month by default; may end in the future). */
  period: { start: IsoDate; end: IsoDate };
  /**
   * Results tracked for the project with the plan for `period`: monthly plans summed in proportion to the days
   * of each month inside the range. The first one is the primary KPI.
   */
  kpis: Kpi[];
  /** Every monthly plan saved so far, oldest first. */
  plans: MonthPlan[];
  /** The last month of `period` has no plan of its own and runs on the previous month's one. */
  planCarried: boolean;
  sources: TrafficSource[];
  notes: string;
  owners: ProjectOwners;
  agent: ProjectAgentSettings;
  metrics: Metrics;
}

/** Settings the AI agent takes from the project instead of asking in Telegram. */
export interface ProjectAgentSettings {
  /** Google Ads conversion actions that count as a lead (names as in the account). */
  leadActions: string[];
  /** Ad account currency, e.g. EUR. */
  currency: string | null;
  budgetMonth: number | null;
  /** Morning report in Telegram. */
  dailyReport: boolean;
}

/** People responsible for the project (account emails); null = not assigned. */
export interface ProjectOwners {
  smm: string | null;
  mediaBuyer: string | null;
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
