/** «Фокус» actions of a log entry: what to do, in the order a person would triage them. */
export const FOCUS = {
  stop: { label: "выключить", className: "bg-negative/12 text-negative" },
  fix: { label: "починить", className: "bg-warning/15 text-warning" },
  scale: { label: "масштабировать", className: "bg-positive/15 text-positive" },
  decide: { label: "решить", className: "bg-accent/40 text-foreground" },
} as const;

export type FocusKey = keyof typeof FOCUS;

/**
 * Two questions, two blocks.
 *  - «Лог» — where is the breakage: errors, missing accesses, wrong settings, going over the budget or the rules.
 *  - «Фокус» — how to improve the result: proposals and analysis, what to scale, where a decision moves the numbers.
 * An entry goes to «Фокус» when it is a proposal / analysis or carries an action about the result: «выключить»,
 * «масштабировать», «решить». Everything else — «починить» or no action at all — is a breakage and goes to «Лог».
 */
export type Lane = "log" | "focus";
export const laneOf = (entry: { kind: string; focus: string | null }): Lane =>
  entry.kind === "proposal" || entry.kind === "analysis" || entry.focus === "stop" || entry.focus === "scale" || entry.focus === "decide"
    ? "focus"
    : "log";

export const formatImpact = (value: number, currency: string | null) =>
  currency
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);

/** The costliest first; entries without a price keep their order after the priced ones. */
export function byImpact<T extends { impact: number | null }>(items: T[]) {
  return [...items].sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1));
}
