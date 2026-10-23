import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatWholeCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { SalesSummary } from "@/lib/sales/stages";

export function SalesSummaryTiles({ summary }: { summary: SalesSummary }) {
  const tiles = [
    { label: "В воронке", value: formatNumber(summary.open), hint: `${formatWholeCurrency(summary.openAmount)} / мес` },
    {
      label: "Активные проекты",
      value: formatNumber(summary.active),
      hint: `${formatWholeCurrency(summary.activeAmount)} / мес`,
      tone: "text-positive",
    },
    {
      label: "Конверсия в активный",
      value: summary.winRate === null ? "—" : formatPercent(summary.winRate),
      hint: "из закрытых сделок",
    },
    {
      label: "Просрочено действий",
      value: formatNumber(summary.overdue),
      hint: "следующий шаг в прошлом",
      tone: summary.overdue > 0 ? "text-negative" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <p className="text-xs text-muted-foreground">{tile.label}</p>
          <p className={cn("mt-2 font-display text-3xl font-extrabold tracking-[-0.03em] tabular-nums lg:text-4xl", tile.tone)}>
            {tile.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{tile.hint}</p>
        </Card>
      ))}
    </div>
  );
}
