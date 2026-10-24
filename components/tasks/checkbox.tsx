import { cn } from "@/lib/cn";

/** Round checkbox in brand colors: navy (lime in dark theme) when checked. */
export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,opacity]",
        checked ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card hover:border-ring/60",
        className,
      )}
    >
      {checked && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-3" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
