import type { CrmType, IntegrationKind } from "./kinds";

export const REPORT_METRICS = ["spend", "impressions", "clicks", "leads", "subscribers"] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export const REPORT_METRIC_LABELS: Record<ReportMetric, string> = {
  spend: "Расход",
  impressions: "Показы",
  clicks: "Клики",
  leads: "Лиды",
  subscribers: "Подписки",
};

export interface ReportTab {
  tab: string;
  /** Which ad data goes to this tab. */
  platform: "google" | "meta" | "all";
  /** Column letter per metric; only these cells are written, formulas elsewhere stay untouched. */
  columns: Partial<Record<ReportMetric, string>>;
}

export interface CrmConfig {
  type: CrmType;
  /** Kommo/amoCRM account domain, e.g. agency.kommo.com */
  domain?: string;
}

export interface SheetConfig {
  url: string;
  spreadsheetId: string;
  title: string;
}

export interface SheetsLeadsConfig extends SheetConfig {
  /** First lead tab (kept for configs saved before multi-tab support). */
  tab: string;
  /** Every tab with one lead per row. */
  tabs?: string[];
  /** Optional tab with sales per period: «Період», «Кількість», «Сума». */
  salesTab?: string | null;
}

export const leadTabsOf = (cfg: SheetsLeadsConfig) => (cfg.tabs?.length ? cfg.tabs : [cfg.tab]).filter(Boolean);

export interface SheetsReportConfig extends SheetConfig {
  tabs: ReportTab[];
}

export interface DriveConfig {
  url: string;
  folderId: string;
  name: string;
}

export type IntegrationConfig = {
  crm: CrmConfig;
  sheets_leads: SheetsLeadsConfig;
  sheets_report: SheetsReportConfig;
  drive: DriveConfig;
};

/** What the browser may see about an integration: never the secret. */
export interface IntegrationView<K extends IntegrationKind = IntegrationKind> {
  kind: K;
  config: IntegrationConfig[K];
  hasSecret: boolean;
  status: "ok" | "error" | "pending";
  lastSyncAt: string | null;
  lastError: string | null;
}

export const LEAD_OUTCOMES = ["new", "qualified", "no_answer", "won", "lost", "junk"] as const;
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];

export interface NormalizedSale {
  externalId: string;
  periodStart: string;
  date: string;
  count: number;
  amount: number;
  currency: string;
  note: string;
}

export interface NormalizedLead {
  externalId: string;
  leadAt: Date;
  name: string;
  phone: string;
  email: string;
  status: string;
  outcome: LeadOutcome;
  value: number | null;
  campaign: string;
  utm: Record<string, string>;
  raw: unknown;
}
