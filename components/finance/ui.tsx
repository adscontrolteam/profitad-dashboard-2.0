import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const monthFmt = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShortFmt = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" });

export const monthLabel = (m: string) => monthFmt.format(new Date(`${m}-01T00:00:00Z`)).replace(" г.", "");
export const monthShort = (m: string) => monthShortFmt.format(new Date(`${m}-01T00:00:00Z`)).replace(".", "");
export const dateLabel = (iso: string) => iso.split("-").reverse().join(".");

export type Tone = "good" | "warning" | "bad" | "info" | "lime";

const TONES: Record<Tone, string> = {
  good: "bg-positive/12 text-positive",
  warning: "bg-warning/14 text-warning",
  bad: "bg-negative/12 text-negative",
  info: "bg-muted text-muted-foreground",
  lime: "bg-cta text-cta-foreground",
};

export function Pill({ tone = "info", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  children,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
  highlight?: boolean;
  tone?: "negative";
}) {
  return (
    <Card className={cn(highlight && "border-transparent bg-[#0b0b0b] text-[#f5f5f5]")}>
      <p className={cn("section-kicker", highlight && "text-[#9a9a9a]")}>{label}</p>
      <p
        className={cn(
          "mt-2 font-display text-3xl font-extrabold tracking-[-0.03em] tabular-nums lg:text-4xl",
          highlight && "text-[#b9ef1c]",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </p>
      {children ? <div className={cn("mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", highlight && "text-[#9a9a9a]")}>{children}</div> : null}
    </Card>
  );
}

export function CardHead({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold tracking-[-0.02em]">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Horizontally scrollable table with the dashboard's row style. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
      <table
        className={cn(
          "w-full border-collapse text-sm [&_td]:whitespace-nowrap [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:pb-2.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-muted-foreground [&_td:first-child]:pl-0 [&_th:first-child]:pl-0",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[16px] bg-muted px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-[16px] bg-muted px-4 py-3 text-[13px] leading-5">{children}</div>;
}
