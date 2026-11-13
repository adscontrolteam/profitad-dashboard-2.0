"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { MAX_RANGE_DAYS, RANGES, shiftIso, todayIso, workspaceHref, type Period } from "@/lib/workspace/params";
import { PillTabs } from "./toolbar";

type Query = Record<string, string | undefined>;

/** Period presets (7/30/90/Год) or, with «Выбранный диапазон» on, a from–to date range. */
export function PeriodControl({ path, query, period }: { path: string; query: Query; period: Period }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState(period.preset === null);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const today = todayIso();
  const base = { ...query, range: undefined, from: undefined, to: undefined };

  const go = (patch: Query) => startTransition(() => router.push(workspaceHref(path, base, patch), { scroll: false }));

  const apply = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo && nextFrom <= nextTo) go({ from: nextFrom, to: nextTo });
  };

  const toggle = (on: boolean) => {
    setCustom(on);
    if (on) go({ from, to });
    else go({});
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <label className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium select-none">
        <input
          type="checkbox"
          checked={custom}
          onChange={(e) => toggle(e.target.checked)}
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
            min={shiftIso(to || today, -(MAX_RANGE_DAYS - 1))}
            max={to || today}
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
            max={today}
            onChange={(e) => apply(from, e.target.value)}
          />
        </div>
      ) : (
        <PillTabs
          label="Период"
          className="w-fit"
          items={RANGES.map((r) => ({
            href: workspaceHref(path, base, { range: r.value === "30" ? undefined : r.value }),
            label: r.label,
            active: r.value === period.preset,
          }))}
        />
      )}
    </div>
  );
}
