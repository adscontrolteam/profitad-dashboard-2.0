import { Card, StatTile } from "@/components/ui/card";
import { DERIVED_METRICS, METRICS } from "@/lib/domain/metrics";
import { METRIC_KEYS, type Metrics } from "@/lib/domain/types";
import { formatMetric } from "@/lib/format";

export function MetricsGrid({ metrics, currency }: { metrics: Metrics; currency?: string | null }) {
  const items = [
    ...METRIC_KEYS.map((key) => ({
      key,
      label: METRICS[key].label,
      value: formatMetric(metrics[key], METRICS[key].format, currency),
    })),
    ...DERIVED_METRICS.map((m) => ({
      key: m.key,
      label: m.label,
      value: formatMetric(m.compute(metrics), m.format, currency),
    })),
  ];

  return (
    <Card className="min-w-0">
      <h2 className="section-title">Метрики</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        За период проекта. Лиды, продажи и выручка — из таблицы клиента или CRM, если подключены; иначе лиды — из кабинета.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {items.map((item) => (
          <StatTile key={item.key} label={item.label}>
            {item.value}
          </StatTile>
        ))}
      </div>
    </Card>
  );
}
