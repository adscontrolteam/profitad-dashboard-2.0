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
import type { Kpi, ProjectServices, ProjectStatus, TrafficPlatform, TrafficSource } from "@/lib/domain/types";
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
  /** Client services the specialists get access to (see lib/access-sync): GA4, GTM, Clarity, Search Console. */
  services: jsonb("services").$type<ProjectServices>().notNull().default({}),
  /** Project chat in Telegram (from /whereami): the «Посмотреть Лог» reminder goes there. */
  telegramChatId: text("telegram_chat_id"),
  telegramThreadId: integer("telegram_thread_id"),
  /** Last «Посмотреть Лог» reminder; the next one comes no sooner than 3 days later. */
  logNotifiedAt: timestamp("log_notified_at", { withTimezone: true }),
  /**
   * Every lead in the project's sheet / CRM came from ads (the sheet is filled with ad leads only), so no click id
   * or paid UTM is needed to count it. Off = only tagged leads count (Lex Dixit: the sheet also gets SEO and direct).
   */
  leadsAllFromAds: boolean("leads_all_from_ads").notNull().default(true),
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
    /** Meta: visits of the Instagram profile from ads (the base of «конверсия в подписчика»). Null = not reported. */
    profileVisits: doublePrecision("profile_visits"),
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
 * No names, phones or emails — only counts. «ads» = every lead when the project says its sheet holds ad leads only
 * (projects.leads_all_from_ads); otherwise the lead carries a click id or a paid UTM, or came before the site
 * recorded click ids while the ads were already running.
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
         (count(*) filter (where outcome <> 'junk' and (utm->>'ad' is not null or (select p.leads_all_from_ads from projects p where p.id = leads.project_id) or ((utm->>'untracked' = '1' or utm->>'google_ref' = '1') and (lead_at at time zone 'UTC')::date >= (select min(a.date) from ad_metrics_daily a where a.project_id = leads.project_id and a.spend > 0)))))::int as leads_ads,
         (count(*) filter (where outcome = 'no_answer' and (utm->>'ad' is not null or (select p.leads_all_from_ads from projects p where p.id = leads.project_id) or ((utm->>'untracked' = '1' or utm->>'google_ref' = '1') and (lead_at at time zone 'UTC')::date >= (select min(a.date) from ad_metrics_daily a where a.project_id = leads.project_id and a.spend > 0)))))::int as no_answer_ads,
         (count(*) filter (where outcome = 'won' and (utm->>'ad' is not null or (select p.leads_all_from_ads from projects p where p.id = leads.project_id) or ((utm->>'untracked' = '1' or utm->>'google_ref' = '1') and (lead_at at time zone 'UTC')::date >= (select min(a.date) from ad_metrics_daily a where a.project_id = leads.project_id and a.spend > 0)))))::int as won_ads,
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

/**
 * Client brief of a project: questions from lib/brief/questions.ts, answered partly by us and partly by the client
 * through a public page behind a secret link (`token`). Internal notes and hidden questions never reach that page.
 */
export const projectBriefs = pgTable(
  "project_briefs",
  {
    projectId: text("project_id").primaryKey(),
    /** Secret of the public link /brief/<token>; a new one revokes the old link. */
    token: text("token").notNull(),
    lang: text("lang").notNull().default("ru"),
    /** question id → answer */
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    /** question id → our note, not shown to the client */
    notes: jsonb("notes").$type<Record<string, string>>().notNull().default({}),
    /** Question ids left out of this client's brief. */
    hidden: jsonb("hidden").$type<string[]>().notNull().default([]),
    files: jsonb("files").$type<{ name: string; at: string; /** Link the file was taken from (links of the brief are fetched once). */ url?: string }[]>().notNull().default([]),
    /** draft = being prepared / filled, submitted = the client pressed «Готово», closed = no more changes. */
    status: text("status").$type<"draft" | "submitted" | "closed">().notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    clientSeenAt: timestamp("client_seen_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_briefs_token_idx").on(t.token)],
);

export type ProjectBriefRow = typeof projectBriefs.$inferSelect;

/**
 * Accesses the dashboard gave (or asked a person to give) to the project's specialists.
 * Only rows with status «granted» / «task» were given by the dashboard and are taken back when the specialist changes;
 * «existing» = the person already had access before — never revoked.
 */
export const projectAccess = pgTable(
  "project_access",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    /** drive | google_ads | ga4 | gtm | meta | clarity | search_console | telegram */
    service: text("service").notNull(),
    /** The resource: folder id, Ads customer id, GA4 property, GTM account/container, ad account, URL. */
    target: text("target").notNull(),
    email: text("email").notNull(),
    /** media_buyer | smm */
    role: text("role").notNull(),
    /** granted | existing | task | failed | revoked | revoke_task */
    status: text("status").notNull(),
    /** What is needed to revoke: permission id, binding name, invitation resource, task id. */
    ref: text("ref"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("project_access_project_idx").on(t.projectId, t.service)],
);

export type ProjectAccessRow = typeof projectAccess.$inferSelect;

/**
 * Project log: proposals, analysis, errors and warnings from the dashboard and the AI agent.
 * status: auto = resolved automatically, needs_you = waits for a person, done = resolved by a person.
 * `topic` groups entries of one recurring condition (e.g. «sync:sheets_leads»): while it holds, one open entry is
 * updated instead of piling up; when it clears, the entry is closed as resolved automatically.
 */
export const projectLog = pgTable(
  "project_log",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /** dashboard | agent */
    source: text("source").notNull().default("dashboard"),
    /** ads | smm | project — which log shows it: «Реклама», «SMM»; the project page shows all of them. */
    area: text("area").$type<"ads" | "smm" | "project">().notNull().default("project"),
    /** proposal | analysis | error | warning | info */
    kind: text("kind").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status").$type<"auto" | "needs_you" | "done">().notNull(),
    topic: text("topic"),
    /** Optional link inside the dashboard (e.g. /inputs) or outside. */
    link: text("link"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    /**
     * «Фокус»: what to give attention to now. scale | stop | fix | decide; null = an ordinary log entry.
     * An open (needs_you) entry with a focus is shown on top of the log and on the dashboard.
     */
    focus: text("focus").$type<"scale" | "stop" | "fix" | "decide">(),
    /** Price of doing nothing for a week, in the project's currency. Sorts the focus list. */
    impact: doublePrecision("impact"),
    /** Roughly how many minutes the action takes. */
    effortMin: integer("effort_min"),
    /** How to undo the action. */
    rollback: text("rollback"),
  },
  (t) => [index("project_log_project_idx").on(t.projectId, t.createdAt), index("project_log_topic_idx").on(t.projectId, t.topic, t.status)],
);

export type ProjectLogRow = typeof projectLog.$inferSelect;

/**
 * Plan of a week (Mon–Sun) per metric: the month's plan split by days, or a manual correction.
 * Auto rows are rewritten on every sync and plan save; manual ones stay until reset. The AI agent reads this table.
 */
export const projectWeekPlans = pgTable(
  "project_week_plans",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Monday, YYYY-MM-DD */
    weekStart: text("week_start").notNull(),
    /** leads | subscribers | sales | revenue | spend (the ad budget of the week) */
    metric: text("metric").notNull(),
    plan: doublePrecision("plan").notNull(),
    manual: boolean("manual").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: text("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.weekStart, t.metric] })],
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

/* ---------------------------------------------------------------- Financial (admin only) */

/**
 * Payment terms of a client project. Revenue of a month = fixAmount + sharePct% of the share base:
 * «client_profit» = client's revenue − ad spend − fixAmount (negative → 0), «client_revenue», «ad_spend».
 */
export const finTerms = pgTable("fin_terms", {
  projectId: text("project_id").primaryKey(),
  fixAmount: doublePrecision("fix_amount").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  sharePct: doublePrecision("share_pct"),
  shareBase: text("share_base").$type<"client_profit" | "client_revenue" | "ad_spend">(),
  /** Media buyer's rate for this project (USD); null = the default by number of traffic sources. */
  buyerRate: doublePrecision("buyer_rate"),
  /** Day of month the invoice is due. */
  payDay: integer("pay_day"),
  /** YYYY-MM the terms apply from. */
  startMonth: text("start_month").notNull(),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export type FinTermsRow = typeof finTerms.$inferSelect;

/** Where clients pay: FOP account, card, crypto wallet, payment link. Details are printed on invoices. */
export const finPaymentMethods = pgTable("fin_payment_methods", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  /** fop | card | crypto | link */
  kind: text("kind").$type<"fop" | "card" | "crypto" | "link">().notNull(),
  details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
  currency: text("currency").notNull().default("UAH"),
  /** Default service line and payment purpose for invoices to this account. */
  serviceName: text("service_name").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  position: integer("position").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FinPaymentMethodRow = typeof finPaymentMethods.$inferSelect;

/** Snapshot of who gets the money, as printed on the invoice. */
export interface InvoiceRecipient {
  kind: string;
  label: string;
  details: Record<string, string>;
  payer?: string;
  /** English «INVOICE» for foreign clients paying by a payment link: the FOP it is issued from and the client. */
  intl?: { fromLabel: string; from: Record<string, string>; billTo: string };
}

export interface InvoiceItem {
  name: string;
  qty: number;
  amount: number;
}

/** Invoices and received payments. `document = false` — a payment recorded without an invoice. */
export const finInvoices = pgTable(
  "fin_invoices",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    projectId: text("project_id"),
    /** YYYY-MM the payment is for. */
    month: text("month").notNull(),
    issueDate: date("issue_date").notNull(),
    methodId: text("method_id"),
    /** Snapshot of the payment details at issue time, so later edits of the account do not change old invoices. */
    recipient: jsonb("recipient").$type<InvoiceRecipient>(),
    currency: text("currency").notNull(),
    items: jsonb("items").$type<InvoiceItem[]>().notNull().default([]),
    total: doublePrecision("total").notNull(),
    purpose: text("purpose").notNull().default(""),
    payLink: text("pay_link").notNull().default(""),
    /** Currency of the client's terms when it differs from the invoice currency, and the agreed rate:
     *  invoice-currency units per 1 unit of the contract currency (e.g. 50.2 UAH per EUR). */
    contractCurrency: text("contract_currency"),
    fxRate: doublePrecision("fx_rate"),
    document: boolean("document").notNull().default(true),
    /** issued | paid | cancelled */
    status: text("status").$type<"issued" | "paid" | "cancelled">().notNull().default("issued"),
    paidDate: date("paid_date"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("fin_invoices_month_idx").on(t.month), index("fin_invoices_project_idx").on(t.projectId)],
);

export type FinInvoiceRow = typeof finInvoices.$inferSelect;

/** Agency expenses. Recurring ones repeat every month from startMonth to endMonth (null = still running). */
export const finExpenses = pgTable("fin_expenses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  recurring: boolean("recurring").notNull().default(false),
  startMonth: text("start_month").notNull(),
  endMonth: text("end_month"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FinExpenseRow = typeof finExpenses.$inferSelect;

/** Team members on payroll. Media buyers / SMM are linked to projects through the project's owner emails. */
export const finStaff = pgTable("fin_staff", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("media_buyer"),
  /** Fixed monthly salary on top of per-project rates (0 = none). */
  baseSalary: doublePrecision("base_salary").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  /** YYYY-MM payroll is counted from. */
  sinceMonth: text("since_month").notNull(),
  active: boolean("active").notNull().default(true),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FinStaffRow = typeof finStaff.$inferSelect;

/** Payroll marked as paid for a person and month (snapshot of the calculation). */
export const finPayouts = pgTable(
  "fin_payouts",
  {
    email: text("email").notNull(),
    month: text("month").notNull(),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    breakdown: jsonb("breakdown").$type<unknown>(),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    paidBy: text("paid_by"),
  },
  (t) => [primaryKey({ columns: [t.email, t.month] })],
);

/** Agency plan per month, in the base currency. */
export const finPlans = pgTable("fin_plans", {
  month: text("month").primaryKey(),
  revenuePlan: doublePrecision("revenue_plan"),
  profitPlan: doublePrecision("profit_plan"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Media buyer's rate for a project (USD) when it differs from the default for one traffic source. */
export const finBuyerRates = pgTable("fin_buyer_rates", {
  projectId: text("project_id").primaryKey(),
  rate: doublePrecision("rate").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** SMM specialist's rate for a project (USD) when it differs from the one by the number of social networks. */
export const finSmmRates = pgTable("fin_smm_rates", {
  projectId: text("project_id").primaryKey(),
  rate: doublePrecision("rate").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A person's work on a project, per role: the day they started (pay for that first month is counted by working
 * days from it, every later month is a full one), what they do there and with how many sources. A row also puts a
 * person on a project they are not the owner of in «Вводные». No row = the owner, from the project's start.
 */
export const finAssignments = pgTable(
  "fin_assignments",
  {
    projectId: text("project_id").notNull(),
    email: text("email").notNull(),
    /** media_buyer | smm */
    role: text("role").notNull(),
    /** The day the person started on the project; null = from the project's start. */
    startDate: date("start_date"),
    /** SMM only: run (monthly, by the number of networks) | setup (one-off set-up task) | test; null = run. */
    task: text("task"),
    /** Traffic sources (media buyer) or social networks (SMM) the person works with; null = as the project has. */
    sources: integer("sources"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.email, t.role] })],
);

/** Terms of one month that differ from the project's usual ones (a discount, a raised fix, another %). null = as usual. */
export const finTermsMonthly = pgTable(
  "fin_terms_monthly",
  {
    projectId: text("project_id").notNull(),
    /** YYYY-MM */
    month: text("month").notNull(),
    fixAmount: doublePrecision("fix_amount"),
    sharePct: doublePrecision("share_pct"),
    note: text("note").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.month] })],
);

/** The client's company details, printed in «BILL TO» of English invoices (one line per row). */
export const finClients = pgTable("fin_clients", {
  projectId: text("project_id").primaryKey(),
  company: text("company").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Social accounts of a project, connected by the client through the public link /connect/<token>
 * (Facebook Login for Pages and Instagram, Threads Login for Threads). One row per account.
 * `token` is AES-GCM encrypted (lib/crypto.ts) and never leaves the server.
 */
export const socialConnections = pgTable(
  "social_connections",
  {
    projectId: text("project_id").notNull(),
    network: text("network").$type<"facebook" | "instagram" | "threads">().notNull(),
    /** Page id, Instagram account id or Threads user id. */
    externalId: text("external_id").notNull(),
    /** Page name or @username. */
    name: text("name").notNull(),
    pictureUrl: text("picture_url"),
    token: text("token").notNull(),
    /** Null = does not expire (Page tokens); Threads tokens live 60 days and are refreshed by the daily cron. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** ok | error */
    status: text("status").notNull().default("ok"),
    lastError: text("last_error"),
    /** Statistics: when they were last pulled and what went wrong (null = fine). */
    statsSyncedAt: timestamp("stats_synced_at", { withTimezone: true }),
    statsError: text("stats_error"),
    /** Who the followers are (age, gender, city shares), refreshed by the statistics sync. */
    audience: jsonb("audience").$type<SocialAudience | null>(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.network, t.externalId] })],
);

export type SocialConnectionRow = typeof socialConnections.$inferSelect;

export interface SocialDayExtra {
  /** Views by Instagram content type: REEL, POST, STORY, CAROUSEL_CONTAINER… */
  byType?: Record<string, number>;
  /** Views by FOLLOWER / NON_FOLLOWER. */
  byFollower?: Record<string, number>;
  linkTaps?: number;
  profileViews?: number;
}
/** Follower counts by group, as the network reports them. */
export interface SocialAudience {
  age?: Record<string, number>;
  gender?: Record<string, number>;
  city?: Record<string, number>;
  country?: Record<string, number>;
}

/**
 * Organic numbers of a connected social account, one row per day. `views`/`follows` come from the network's
 * account statistics; `followers` is the total we saw that day (a snapshot taken by the sync).
 */
export const socialMetricsDaily = pgTable(
  "social_metrics_daily",
  {
    projectId: text("project_id").notNull(),
    network: text("network").$type<"facebook" | "instagram" | "threads">().notNull(),
    accountId: text("account_id").notNull(),
    date: date("date").notNull(),
    views: integer("views"),
    reach: integer("reach"),
    /** New followers that day, when the network reports it. */
    follows: integer("follows"),
    /** Accounts that unfollowed that day, when the network reports it. */
    unfollows: integer("unfollows"),
    /** Instagram splits of the day: views by content type and by follower / non-follower, taps on the profile link, profile visits. */
    extra: jsonb("extra").$type<SocialDayExtra | null>(),
    /** Total followers, only on the days the sync ran. */
    followers: integer("followers"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.network, t.accountId, t.date] })],
);

/** Publications of a connected social account with their current counters (refreshed by the sync). */
export const socialPosts = pgTable(
  "social_posts",
  {
    projectId: text("project_id").notNull(),
    network: text("network").$type<"facebook" | "instagram" | "threads">().notNull(),
    accountId: text("account_id").notNull(),
    postId: text("post_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    /** reel | carousel | post | video */
    kind: text("kind").notNull().default("post"),
    title: text("title").notNull().default(""),
    permalink: text("permalink"),
    thumbnailUrl: text("thumbnail_url"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    /** Threads: the topic tag of the publication (or its first hashtag); null when it has none. */
    topic: text("topic"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.network, t.postId] }), index("social_posts_project_idx").on(t.projectId, t.network, t.publishedAt)],
);

/** Secret of a project's ManyChat address: automations post their funnel steps to /api/hooks/manychat/<token>. */
export const manychatHooks = pgTable(
  "manychat_hooks",
  {
    projectId: text("project_id").primaryKey(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("manychat_hooks_token_idx").on(t.token)],
);

/** One funnel step reported by a ManyChat automation («Make External Request»). The time is when we received it. */
export const manychatEvents = pgTable(
  "manychat_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    /** start = the automation was triggered, contact = the person left a contact, lead = handed over to the CRM. */
    step: text("step").$type<"start" | "contact" | "lead">().notNull(),
    /** The code word of the funnel, as typed into the automation's request. */
    keyword: text("keyword").notNull(),
    subscriberId: text("subscriber_id").notNull().default(""),
    igUsername: text("ig_username").notNull().default(""),
    /** What the person wrote last before the step. */
    lastInput: text("last_input").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("manychat_events_project_idx").on(t.projectId, t.receivedAt)],
);

/** Secret of a project's public «connect your social accounts» link; a new token revokes the old link. */
export const socialConnectLinks = pgTable(
  "social_connect_links",
  {
    projectId: text("project_id").primaryKey(),
    token: text("token").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("social_connect_links_token_idx").on(t.token)],
);

/**
 * «Вопрос агенту» on the project page: questions and answers about one project. The history is the project's
 * memory — the next question is answered with the previous turns in view. Shared by everyone who sees the project.
 */
export const projectChat = pgTable(
  "project_chat",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    /** Who asked (email); null for answers. */
    author: text("author"),
    /** API cost of the answer in USD, from the token usage. */
    costUsd: doublePrecision("cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("project_chat_project_idx").on(t.projectId, t.createdAt)],
);

export type ProjectChatRow = typeof projectChat.$inferSelect;
