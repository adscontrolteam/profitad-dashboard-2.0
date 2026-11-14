import { ProgressBar } from "@/components/ui/progress-bar";
import { SIGNAL_TEXT } from "@/components/ui/signal";
import { cn } from "@/lib/cn";
import { METRICS } from "@/lib/domain/metrics";
import { paceLevel } from "@/lib/domain/stats";
import { GOAL_LEVELS, type KpiStats } from "@/lib/domain/types";
import { formatMetric, formatPercent } from "@/lib/format";

export function PlanFact({ result, elapsed }: { result: KpiStats; elapsed: number }) {
  const { kpi } = result;
  const level = paceLevel(result.pace);
  const format = METRICS[kpi.metric].format;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            План / факт · {METRICS[kpi.metric].label.toLowerCase()}
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold tracking-[-0.03em] tabular-nums">
            {formatMetric(result.fact, format)}
            <span className="text-muted-foreground"> / {formatMetric(kpi.plan, format)}</span>
          </p>
        </div>
        <p className={cn("font-display text-2xl font-extrabold tracking-[-0.03em] tabular-nums", SIGNAL_TEXT[level])}>
          {result.progress === null ? "—" : formatPercent(result.progress)}
        </p>
      </div>
      <ProgressBar value={result.progress ?? 0} marker={elapsed} pace={result.pace} />
      <GoalLevels result={result} />
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>Прошло {formatPercent(elapsed)} периода</span>
        {result.pace === null ? (
          <span>{result.kpi.plan ? "Нет данных" : "План не задан"}</span>
        ) : (
          <span>
            Темп <span className={cn("font-semibold", SIGNAL_TEXT[level])}>{formatPercent(result.pace)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Б / Б+ / С: which goal levels are already reached and which one the pace leads to by the end of the period.
 * Hidden when only Б is set — the bar above says it all.
 */
function GoalLevels({ result }: { result: KpiStats }) {
  const format = METRICS[result.kpi.metric].format;
  const levels = GOAL_LEVELS.map((lv) => ({ label: lv.label, value: (result.kpi[lv.plan] as number | null | undefined) ?? null })).filter(
    (lv): lv is { label: "Б" | "Б+" | "С"; value: number } => lv.value !== null && lv.value > 0,
  );
  if (levels.length < 2) return null;
  const reached = levels.filter((lv) => result.fact >= lv.value).at(-1);
  const heading = levels.filter((lv) => result.forecast >= lv.value).at(-1);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
      {levels.map((lv) => {
        const done = result.fact >= lv.value;
        return (
          <span
            key={lv.label}
            className={cn(
              "rounded-full px-2.5 py-0.5",
              done ? "bg-positive/12 font-semibold text-positive" : heading?.label === lv.label ? "bg-muted font-semibold" : "bg-muted text-muted-foreground",
            )}
            title={done ? "Цель достигнута" : heading?.label === lv.label ? "Темп ведёт к этой цели" : undefined}
          >
            {lv.label} {formatMetric(lv.value, format)}
            {done ? " ✓" : ""}
          </span>
        );
      })}
      <span className="ml-auto text-muted-foreground">
        {reached ? `достигнута ${reached.label}` : "цели ещё впереди"}
        {result.pace !== null && ` · по темпу — ${heading ? heading.label : "ниже Б"}`}
      </span>
    </div>
  );
}
