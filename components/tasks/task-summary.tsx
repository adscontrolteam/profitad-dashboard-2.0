import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { TaskSummary } from "@/lib/tasks/stages";

export function TaskSummaryTiles({ summary }: { summary: TaskSummary }) {
  const tiles = [
    { label: "Открытые задачи", value: summary.open, hint: "всё, кроме «Выполнено»" },
    { label: "В работе", value: summary.inProgress, hint: "прямо сейчас" },
    {
      label: "Просрочено",
      value: summary.overdue,
      hint: "дедлайн в прошлом",
      tone: summary.overdue > 0 ? "text-negative" : undefined,
    },
    { label: "Мои задачи", value: summary.mine, hint: "открытые на мне" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <p className="text-xs text-muted-foreground">{tile.label}</p>
          <p className={cn("mt-2 font-display text-3xl font-extrabold tracking-[-0.03em] tabular-nums lg:text-4xl", tile.tone)}>
            {formatNumber(tile.value)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
        </Card>
      ))}
    </div>
  );
}
