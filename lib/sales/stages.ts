import type { StatusTone } from "@/lib/domain/statuses";

/** Pipeline order. Add or rename stages here; the board, forms and stats follow. */
export const DEAL_STAGES = [
  "contacted",
  "call_scheduled",
  "brief",
  "proposal",
  "negotiation",
  "active",
  "inactive",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_META: Record<DealStage, { label: string; tone: StatusTone }> = {
  contacted: { label: "Связались с проектом", tone: "gray" },
  call_scheduled: { label: "Созвон назначен", tone: "blue" },
  // Stored as «brief» (the stage used to be «Бриф получен»); renamed without moving the deals.
  brief: { label: "В анализе", tone: "blue" },
  proposal: { label: "КП отправлено", tone: "amber" },
  negotiation: { label: "Переговоры", tone: "amber" },
  active: { label: "Активный проект", tone: "green" },
  inactive: { label: "Неактивный проект", tone: "red" },
};

/** Stages that count as an open deal in the pipeline. */
export const isOpenStage = (stage: DealStage) => stage !== "active" && stage !== "inactive";

export const isDealStage = (value: unknown): value is DealStage =>
  DEAL_STAGES.includes(value as DealStage);

export interface Deal {
  id: string;
  name: string;
  contactName: string;
  contact: string;
  source: string;
  /** Expected monthly budget, USD. */
  amount: number | null;
  stage: DealStage;
  /** Order inside a stage column. */
  position: number;
  notes: string;
  /** YYYY-MM-DD */
  nextActionAt: string | null;
  nextAction: string;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SalesSummary {
  open: number;
  openAmount: number;
  active: number;
  activeAmount: number;
  /** active / (active + inactive), null when nothing is closed yet. */
  winRate: number | null;
  overdue: number;
}

export function summarizeDeals(deals: Deal[], today: string): SalesSummary {
  const open = deals.filter((d) => isOpenStage(d.stage));
  const active = deals.filter((d) => d.stage === "active");
  const inactive = deals.filter((d) => d.stage === "inactive");
  const sum = (list: Deal[]) => list.reduce((acc, d) => acc + (d.amount ?? 0), 0);
  const closed = active.length + inactive.length;

  return {
    open: open.length,
    openAmount: sum(open),
    active: active.length,
    activeAmount: sum(active),
    winRate: closed ? active.length / closed : null,
    overdue: open.filter((d) => d.nextActionAt && d.nextActionAt < today).length,
  };
}
