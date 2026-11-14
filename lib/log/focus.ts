/** «Фокус» actions of a log entry: what to do, in the order a person would triage them. */
export const FOCUS = {
  stop: { label: "выключить", className: "bg-negative/12 text-negative" },
  fix: { label: "починить", className: "bg-warning/15 text-warning" },
  scale: { label: "масштабировать", className: "bg-positive/15 text-positive" },
  decide: { label: "решить", className: "bg-accent/40 text-foreground" },
} as const;

export type FocusKey = keyof typeof FOCUS;

export const formatImpact = (value: number, currency: string | null) =>
  currency
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);

/** The costliest first; entries without a price keep their order after the priced ones. */
export function byImpact<T extends { impact: number | null }>(items: T[]) {
  return [...items].sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
}
