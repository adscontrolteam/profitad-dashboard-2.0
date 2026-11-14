import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { IntegrationKind } from "@/lib/integrations/kinds";
import type { Kpi, ProjectStatus, TrafficPlatform, TrafficSource } from "@/lib/domain/types";
import type { DealStage } from "@/lib/sales/stages";
import type { TaskStage } from "@/lib/tasks/stages";

/** Access is bound to the account email, so it can be granted before the first sign-in. */
export const accessGrants = pgTable("access_grants", {
  email: text("email").primaryKey(),
  /** An AssignableRole; older rows may hold a role from the previous access model. */
  role: text("role").notNull(),
  /** Unused since the role-based model (kept so no migration is needed). */
  sections: jsonb("sections").$type<string[]>().notNull().default([]),
  /** null means all projects. */
  projectIds: jsonb("project_ids").$type<string[] | null>(),
  /** Unused since the role-based model. */
  canEditInputs: boolean("can_edit_inputs").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export type AccessGrantRow = typeof accessGrants.$inferSelect;

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    contactName: text("contact_name").notNull().default(""),
    contact: text("contact").notNull().default(""),
    source: text("source").notNull().default(""),
    amount: integer("amount"),
    stage: text("stage").$type<DealStage>().notNull(),
    position: doublePrecision("position").notNull().default(0),
    notes: text("notes").notNull().default(""),
    nextActionAt: date("next_action_at"),
    nextAction: text("next_action").notNull().default(""),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => [index("deals_stage_position_idx").on(t.stage, t.position)],
);

export type DealRow = typeof deals.$inferSelect;

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Not a foreign key: tasks outlive deleted projects. */
    projectId: text("project_id"),
    assigneeEmail: text("assignee_email"),
    deadline: date("deadline"),
    stage: text("stage").$type<TaskStage>().notNull(),
    position: doublePrecision("position").notNull().default(0),
    /** Set when archived by hand or together with its project. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by"),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => [
    index("tasks_stage_position_idx").on(t.stage, t.position),
    index("tasks_project_idx").on(t.projectId),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;

export const taskComments = pgTable(
  "task_comments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorEmail: text("author_email").notNull(),
    authorName: text("author_name"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt)],
);

export type TaskCommentRow = typeof taskComments.$inferSelect;

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").$type<ProjectStatus>().notNull(),
  goal: text("goal").notNull().default(""),
  /** Start of work. Results are viewed for any range; plans are set per month in project_plans. */
  periodStart: date("period_start").notNull(),
  /** Legacy fixed period end — no longer used. */
  periodEnd: date("period_end"),
  /** Plan of the current month, mirrored from project_plans for the AI agent (docs/agent-contract.md). */
  kpis: jsonb("kpis").$type<Kpi[]>().notNull().default([]),
  sources: jsonb("sources").$type<TrafficSource[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  /** Responsible SMM and media buyer (account emails); null = not assigned. */
  smmEmail: text("smm_email"),
  mediaBuyerEmail: text("media_buyer_email"),
  /** What the AI agent needs (read by the agent through the bot_sync role; see docs/agent-contract.md). */
  leadActions: jsonb("lead_actions").$type<string[]>().notNull().default([]),
  /** Meta action types counted as leads / subscribers (e.g. "lead", "like"); empty = defaults, see lib/meta/results.ts. */
  metaActions: jsonb("meta_actions").$type<{ leads?: string[]; subscribers?: string[] }>().notNull().default({}),
  currency: text("currency"),
  budgetMonth: doublePrecision("budget_month"),
  agentDailyReport: boolean("agent_daily_report").notNull().default(true),
  /** Where the AI agent counts leads: ads = Google Ads conversions (lead_actions), sheet = client's lead sheet / CRM, both. */
  agentLeadSource: text("agent_lead_source").$type<"ads" | "sheet" | "both">().notNull().default("ads"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export type ProjectRow = typeof projects.$inferSelect;

/** The plan set at the start of each month: KPI amounts and prices, ad budget. A month without a row keeps the previous plan. */
export const projectPlans = pgTable(
  "project_plans",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** YYYY-MM */
    month: text("month").notNull(),
    kpis: jsonb("kpis").$type<Kpi[]>().notNull().default([]),
    budgetMonth: doublePrecision("budget_month"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.month] })],
);

/**
 * One row per campaign per day, written by the ad-platform sync.
 * Sales and revenue stay null until a CRM source is connected.
 */
export const adMetricsDaily = pgTable(
  "ad_metrics_daily",
  {
    date: date("date").notNull(),
    platform: text("platform").$type<TrafficPlatform>().notNull(),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name").notNull().default(""),
    projectId: text("project_id").notNull(),
    spend: doublePrecision("spend").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    leads: doublePrecision("leads").notNull().default(0),
    subscribers: doublePrecision("subscribers").notNull().default(0),
    sales: doublePrecision("sales"),
    revenue: doublePrecision("revenue"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.platform, t.accountId, t.campaignId] }),
    index("ad_metrics_project_date_idx").on(t.projectId, t.date),
  ],
);

/**
 * A project's external connection: CRM, Google Sheets (leads in / daily report out), Google Drive.
 * One row per project and kind. `config` holds non-secret settings; `secret` is AES-GCM encrypted
 * (see lib/crypto.ts) and never leaves the server.
 */
export const projectIntegrations = pgTable(
  "project_integrations",
  {
    projectId: text("project_id").notNull(),
    kind: text("kind").$type<IntegrationKind>().notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secret: text("secret"),
    /** ok | error | pending */
    status: text("status").notNull().default("pending"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.kind] })],
);

export type ProjectIntegrationRow = typeof projectIntegrations.$inferSelect;

/** Leads from CRMs, webhooks and lead sheets; re-imports update the same row by (project, source, external id). */
export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    /** webhook | kommo | bitrix24 | sheet */
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    leadAt: timestamp("lead_at", { withTimezone: true }).notNull(),
    name: text("name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    /** Stage/status as named in the source (e.g. a Kommo pipeline status). */
    status: text("status").notNull().default(""),
    /** new | qualified | no_answer | won | lost | junk — normalized where the source allows. */
    outcome: text("outcome").notNull().default("new"),
    value: doublePrecision("value"),
    campaign: text("campaign").notNull().default(""),
    utm: jsonb("utm").$type<Record<string, string>>().notNull().default({}),
    raw: jsonb("raw").$type<unknown>(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("leads_source_external_idx").on(t.projectId, t.source, t.externalId),
    index("leads_project_time_idx").on(t.projectId, t.leadAt),
  ],
);

export type LeadRow = typeof leads.$inferSelect;

/**
 * Leads from the client's sheet / CRM per project, day and campaign, for the AI agent (role bot_sync).
 * No names, phones or emails — only counts. «ads» = the lead carries a click id or a paid UTM.
 * See docs/agent-contract.md.
 */
export const agentLeadsDaily = pgView("agent_leads_daily", {
  projectId: text("project_id").notNull(),
  day: date("day").notNull(),
  campaign: text("campaign").notNull(),
  leadsAll: integer("leads_all").notNull(),
  leadsAds: integer("leads_ads").notNull(),
  noAnswerAds: integer("no_answer_ads").notNull(),
  wonAds: integer("won_ads").notNull(),
  junk: integer("junk").notNull(),
}).as(sql`
  select project_id,
         (lead_at at time zone 'UTC')::date as day,
         coalesce(nullif(utm->>'utm_campaign', ''), nullif(campaign, ''), '') as campaign,
         (count(*) filter (where outcome <> 'junk'))::int as leads_all,
         (count(*) filter (where outcome <> 'junk' and utm->>'ad' is not null))::int as leads_ads,
         (count(*) filter (where outcome = 'no_answer' and utm->>'ad' is not null))::int as no_answer_ads,
         (count(*) filter (where outcome = 'won' and utm->>'ad' is not null))::int as won_ads,
         (count(*) filter (where outcome = 'junk'))::int as junk
  from leads
  group by 1, 2, 3`);

/**
 * Sales recorded outside a CRM, e.g. a «Продажи» sheet kept by the client per period (not per lead).
 * A sync replaces all rows of its source, so the sheet stays the source of truth.
 */
export const salesRecords = pgTable(
  "sales_records",
  {
    projectId: text("project_id").notNull(),
    /** e.g. sheet:<spreadsheetId>:<tab> */
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    /** Last day of the period the row covers. */
    date: date("date").notNull(),
    periodStart: date("period_start").notNull(),
    count: doublePrecision("count").notNull().default(0),
    amount: doublePrecision("amount").notNull().default(0),
    currency: text("currency").notNull().default(""),
    note: text("note").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.source, t.externalId] }), index("sales_records_project_date_idx").on(t.projectId, t.date)],
);

/** Every action that changes something outside the dashboard (ad platforms, sheets, drive). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    projectId: text("project_id"),
    target: text("target").notNull().default(""),
    payload: jsonb("payload").$type<unknown>(),
    ok: boolean("ok").notNull(),
    result: text("result").notNull().default(""),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);
