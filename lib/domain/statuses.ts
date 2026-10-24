import type { ProjectStatus } from "./types";

export type StatusTone = "green" | "amber" | "blue" | "red" | "gray";

export const STATUS_META: Record<
  ProjectStatus,
  { label: string; summaryLabel: string; tone: StatusTone }
> = {
  active: { label: "Активен", summaryLabel: "Проектов активных", tone: "green" },
  awaiting_feedback: { label: "Ждём фидбек", summaryLabel: "Проектов ждём фидбек", tone: "amber" },
  awaiting_offer: { label: "Ждёт оффер", summaryLabel: "Проектов ждёт оффер", tone: "blue" },
  need_contact: { label: "Связаться", summaryLabel: "Проектов связаться", tone: "red" },
  paused: { label: "На паузе", summaryLabel: "Проектов на паузе", tone: "gray" },
  archived: { label: "В архиве", summaryLabel: "Проектов в архиве", tone: "gray" },
};

/** Statuses shown as summary cards on the dashboard, in display order. */
export const DASHBOARD_STATUSES: ProjectStatus[] = [
  "active",
  "awaiting_feedback",
  "awaiting_offer",
  "need_contact",
];
