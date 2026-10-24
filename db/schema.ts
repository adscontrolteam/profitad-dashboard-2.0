import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AssignableRole, Section } from "@/lib/access/roles";
import type { Kpi, ProjectStatus, TrafficPlatform, TrafficSource } from "@/lib/domain/types";
import type { DealStage } from "@/lib/sales/stages";
import type { TaskStage } from "@/lib/tasks/stages";

/** Access is bound to the account email, so it can be granted before the first sign-in. */
export const accessGrants = pgTable("access_grants", {
  email: text("email").primaryKey(),
  role: text("role").$type<AssignableRole>().notNull(),
  /** Custom role only. */
  sections: jsonb("sections").$type<Section[]>().notNull().default([]),
  /** Custom role only; null means all projects. */
  projectIds: jsonb("project_ids").$type<string[] | null>(),
  /** Custom role only. */
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
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  kpis: jsonb("kpis").$type<Kpi[]>().notNull().default([]),
  sources: jsonb("sources").$type<TrafficSource[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

export type ProjectRow = typeof projects.$inferSelect;

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
