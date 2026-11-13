import { cn } from "@/lib/cn";

const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

export const formatCompact = (v: number) => compact.format(v);
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));

/** Smooth line + soft fill, drawn in the accent color. */
export function AreaChart({
  points,
  labels,
  height = 180,
  className,
  format = formatCompact,
}: {
  points: number[];
  labels: string[];
  height?: number;
  className?: string;
  format?: (v: number) => string;
}) {
  const W = 600;
  const H = 200;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const xy = points.map((v, i) => [i * step, H - (v / max) * (H - 12) - 4] as const);

  let line = "";
  xy.forEach(([x, y], i) => {
    if (i === 0) {
      line = `M${x},${y}`;
      return;
    }
    const [px, py] = xy[i - 1];
    const cx = (px + x) / 2;
    line += ` C${cx},${py} ${cx},${y} ${x},${y}`;
  });
  const area = `${line} L${W},${H} L0,${H} Z`;
  const peak = points.indexOf(max);
  const ticks = [1, 0.66, 0.33];

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pr-1">
        {ticks.map((t) => (
          <div key={t} className="flex items-center gap-2 border-t border-dashed border-border/80">
            <span className="ml-auto -translate-y-1/2 bg-card pl-1 text-[10px] tabular-nums text-muted-foreground">
              {format(max * t)}
            </span>
          </div>
        ))}
        <div />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible text-accent">
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#area-fill)" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.length > 0 && (
        <span
          className="absolute -translate-x-1/2 -translate-y-full rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-accent-foreground"
          style={{ left: `${(peak / Math.max(1, points.length - 1)) * 100}%`, top: `${(1 - max / max) * 100 + 4}%` }}
        >
          {labels[peak] ? `${formatShortDate(labels[peak])}: ` : ""}
          {format(max)}
        </span>
      )}
    </div>
  );
}

/** Daily bars with the result count above each bar (hidden when too dense). */
export function BarChart({
  bars,
  height = 170,
  valueLabel,
  barTitle,
}: {
  bars: { date: string; value: number; label?: string }[];
  height?: number;
  valueLabel?: boolean;
  barTitle?: (bar: { date: string; value: number; label?: string }) => string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const dense = bars.length > 45;
  const every = Math.max(1, Math.ceil(bars.length / 12));

  return (
    <div className="w-full overflow-x-auto [scrollbar-width:thin]">
      <div className="flex min-w-[420px] items-end gap-[3px]" style={{ height }}>
        {bars.map((bar) => (
          <div
            key={bar.date}
            className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={barTitle?.(bar)}
          >
            {valueLabel && !dense && bar.label !== undefined && (
              <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{bar.label}</span>
            )}
            <div
              className="w-full rounded-t-[5px] bg-foreground/80 transition-colors group-hover:bg-accent dark:bg-foreground/70"
              style={{ height: `${Math.max(2, (bar.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex min-w-[420px] gap-[3px]">
        {bars.map((bar, i) => (
          <span key={bar.date} className="min-w-0 flex-1 text-center text-[9px] tabular-nums text-muted-foreground">
            {i % every === 0 ? new Date(bar.date).getUTCDate() : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function KpiTile({
  label,
  value,
  hint,
  delta,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-[22px] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        {delta}
      </div>
      <p className="mt-2 font-[family-name:var(--font-manrope)] text-[26px] leading-8 font-bold tracking-[-0.03em] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}
