import { cn } from "@/lib/cn";
import { paceLevel } from "@/lib/domain/stats";
import { SIGNAL_BG, SIGNAL_TEXT } from "./signal";

interface ProgressBarProps {
  /** 0..n, clamped to 1 visually */
  value: number;
  /** Share of the period elapsed, rendered as a marker. */
  marker?: number;
  /** Colors the bar by pace; defaults to the value itself, null = neutral. */
  pace?: number | null;
  className?: string;
}

export function ProgressBar({ value, marker, pace = value, className }: ProgressBarProps) {
  const level = paceLevel(pace);
  return (
    <div className={cn("relative h-2 w-full rounded-full bg-track", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          level !== "none" && "signal-glow",
          SIGNAL_BG[level],
          SIGNAL_TEXT[level],
        )}
        style={{ width: `${Math.min(value, 1) * 100}%` }}
      />
      {marker !== undefined && (
        <div
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/40"
          style={{ left: `${Math.min(marker, 1) * 100}%` }}
          title="Сколько периода прошло"
          aria-hidden
        />
      )}
    </div>
  );
}
