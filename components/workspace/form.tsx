"use client";

import { cn } from "@/lib/cn";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
        {hint && <span className="ml-1 font-normal opacity-80">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex w-fit max-w-full flex-wrap gap-1 rounded-[18px] border border-border bg-background/60 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            o.value === value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        on ? "border-transparent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
      <h3 className="mb-4 flex items-center gap-3 text-base font-bold tracking-[-0.02em]">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-[18px] bg-foreground px-4 py-3 text-sm text-background shadow-[var(--shadow)] lg:bottom-6"
    >
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onClose} className="text-xs font-semibold opacity-70 hover:opacity-100">
        OK
      </button>
    </div>
  );
}
