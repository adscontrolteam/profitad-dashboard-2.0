import { cn } from "@/lib/cn";
import { healthTitle, type Health, type HealthZone } from "@/lib/domain/health";

const TONE: Record<HealthZone, string> = {
  green: "border-positive/40 bg-positive/12 text-positive",
  yellow: "border-warning/40 bg-warning/14 text-warning",
  red: "border-negative/40 bg-negative/12 text-negative",
  none: "border-border bg-muted text-muted-foreground",
};

/** The project's score, 0–100, in the colour of its zone. Hovering shows what it is made of. */
export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      title={healthTitle(health)}
      aria-label={health.score === null ? "Оценка проекта: нет данных" : `Оценка проекта: ${health.score} из 100`}
      className={cn(
        "inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full border px-2 text-[13px] font-bold tabular-nums",
        TONE[health.zone],
        className,
      )}
    >
      {health.score ?? "—"}
    </span>
  );
}
