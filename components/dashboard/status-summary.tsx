import { Card } from "@/components/ui/card";
import { TONE_DOT } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { DASHBOARD_STATUSES, STATUS_META } from "@/lib/domain/statuses";
import type { StatusSummary as Summary } from "@/lib/domain/types";

export function StatusSummary({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
      {DASHBOARD_STATUSES.map((status) => {
        const meta = STATUS_META[status];
        return (
          <Card key={status}>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("size-2 rounded-full", TONE_DOT[meta.tone])} aria-hidden />
              {meta.summaryLabel}
            </p>
            <p className="mt-2 font-display text-3xl font-extrabold tracking-[-0.03em] tabular-nums lg:text-4xl">
              {summary[status]}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
