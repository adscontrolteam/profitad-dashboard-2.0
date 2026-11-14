"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { PROJECT_RANGES, type ProjectPeriod } from "@/lib/projects/range";
import { workspaceHref } from "@/lib/workspace/params";
import { PillTabs } from "@/components/workspace/toolbar";

/** Like the analytics period control, but in whole months — the plans are monthly. */
export function ProjectPeriodControl({ path, period, maxDate }: { path: string; period: ProjectPeriod; maxDate: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState(period.preset === null);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  const go = (patch: Record<string, string | undefined>) =>
    startTransition(() => router.push(workspaceHref(path, {}, patch), { scroll: false }));

  const apply = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo && nextFrom <= nextTo) go({ from: nextFrom, to: nextTo });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <label className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium select-none">
        <input
          type="checkbox"
          checked={custom}
          onChange={(e) => {
            setCustom(e.target.checked);
            go(e.target.checked ? { from, to } : {});
          }}
          className="size-4 cursor-pointer accent-[var(--accent)]"
        />
        Выбранный диапазон
      </label>
      {custom ? (
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card p-1">
          <input
            type="date"
            aria-label="С даты"
            className="rounded-full bg-transparent px-3 py-1 text-sm tabular-nums outline-none focus-visible:bg-muted"
            value={from}
            max={to || maxDate}
            onChange={(e) => apply(e.target.value, to)}
          />
          <span className="text-muted-foreground" aria-hidden>
            —
          </span>
          <input
            type="date"
            aria-label="По дату"
            className="rounded-full bg-transparent px-3 py-1 text-sm tabular-nums outline-none focus-visible:bg-muted"
            value={to}
            min={from}
            max={maxDate}
            onChange={(e) => apply(from, e.target.value)}
          />
        </div>
      ) : (
        <PillTabs
          label="Период"
          className="w-fit"
          items={PROJECT_RANGES.map((r) => ({
            href: workspaceHref(path, {}, { range: r.value === "month" ? undefined : r.value }),
            label: r.label,
            active: r.value === period.preset,
          }))}
        />
      )}
    </div>
  );
}
