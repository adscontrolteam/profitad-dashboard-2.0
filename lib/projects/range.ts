import { addMonths, currentMonth, monthEnd, monthStart } from "./plans";

/** Project page periods: whole months, since plans are monthly. `?range=` or a custom `?from=&to=`. */
export const PROJECT_RANGES = [
  { value: "month", label: "Этот месяц" },
  { value: "prev", label: "Прошлый месяц" },
  { value: "3m", label: "3 месяца" },
  { value: "year", label: "12 месяцев" },
  { value: "all", label: "Всё время" },
] as const;

export type ProjectRangeValue = (typeof PROJECT_RANGES)[number]["value"];

export interface ProjectPeriod {
  preset: ProjectRangeValue | null;
  from: string;
  to: string;
  label: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const short = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function parseProjectPeriod(range: unknown, from: unknown, to: unknown, startDate: string): ProjectPeriod {
  const now = currentMonth();
  const lastDay = monthEnd(now);
  if (typeof from === "string" && typeof to === "string" && ISO.test(from) && ISO.test(to)) {
    let a = from <= to ? from : to;
    let b = from <= to ? to : from;
    if (b > lastDay) b = lastDay;
    if (a > b) a = b;
    return { preset: null, from: a, to: b, label: `${short.format(new Date(a))} — ${short.format(new Date(b))}` };
  }
  const preset = PROJECT_RANGES.find((r) => r.value === range)?.value ?? "month";
  const label = PROJECT_RANGES.find((r) => r.value === preset)!.label;
  switch (preset) {
    case "prev":
      return { preset, from: monthStart(addMonths(now, -1)), to: monthEnd(addMonths(now, -1)), label };
    case "3m":
      return { preset, from: monthStart(addMonths(now, -2)), to: lastDay, label };
    case "year":
      return { preset, from: monthStart(addMonths(now, -11)), to: lastDay, label };
    case "all":
      return { preset, from: startDate < lastDay ? startDate : monthStart(now), to: lastDay, label };
    default:
      return { preset: "month", from: monthStart(now), to: lastDay, label };
  }
}
