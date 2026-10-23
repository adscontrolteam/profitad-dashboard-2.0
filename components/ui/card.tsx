import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow)] sm:p-5 lg:p-6",
        className,
      )}
      {...props}
    />
  );
}

export function StatTile({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-[16px] border border-border bg-background/70 px-4 py-3", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-semibold leading-6 tabular-nums [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-4">
      {kicker ? <p className="section-kicker mb-1">{kicker}</p> : null}
      <h2 className="section-title">{children}</h2>
    </div>
  );
}
