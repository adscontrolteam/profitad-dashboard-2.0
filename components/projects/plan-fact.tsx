import { ProgressBar } from "@/components/ui/progress-bar";
import { SIGNAL_TEXT } from "@/components/ui/signal";
import { cn } from "@/lib/cn";
import { METRICS } from "@/lib/domain/metrics";
import { paceLevel } from "@/lib/domain/stats";
import type { KpiStats } from "@/lib/domain/types";
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
