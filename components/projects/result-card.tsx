import { Card, StatTile } from "@/components/ui/card";
import { Delta } from "@/components/ui/signal";
import { METRICS } from "@/lib/domain/metrics";
import type { KpiStats } from "@/lib/domain/types";
import { formatMetric } from "@/lib/format";
import { PlanFact } from "./plan-fact";

/** One tracked result: plan/fact with pace, plus target vs actual cost per result. */
export function ResultCard({ result, elapsed, currency = null }: { result: KpiStats; elapsed: number; currency?: string | null }) {
  const formatCurrency = (v: number) => formatMetric(v, "currency", currency);
  const { cpaPlan } = result.kpi;
  const cpaDelta = cpaPlan && result.cpaFact !== null ? (result.cpaFact - cpaPlan) / cpaPlan : null;
  const unit = METRICS[result.kpi.metric].label.toLowerCase();

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <PlanFact result={result} elapsed={elapsed} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile label={`Цель по цене (Б) · ${unit}`}>
          {cpaPlan ? formatCurrency(cpaPlan) : "—"}
          {(result.kpi.cpaPlus || result.kpi.cpaSuper) && (
            <span className="block text-xs font-normal text-muted-foreground tabular-nums">
              {[result.kpi.cpaPlus ? `Б+ ${formatCurrency(result.kpi.cpaPlus)}` : null, result.kpi.cpaSuper ? `С ${formatCurrency(result.kpi.cpaSuper)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </StatTile>
        <StatTile label="Факт цены">
          <div className="flex flex-wrap items-center gap-2">
            {result.cpaFact !== null ? formatCurrency(result.cpaFact) : "—"}
            {cpaDelta !== null ? <Delta value={cpaDelta} goodWhen="down" /> : null}
          </div>
        </StatTile>
      </div>
    </Card>
  );
}
