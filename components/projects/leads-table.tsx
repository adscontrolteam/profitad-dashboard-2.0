"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { LeadSource } from "@/lib/integrations/lead-source";

export interface LeadRowView {
  id: string;
  /** Already formatted for display. */
  when: string;
  name: string;
  contact: string;
  campaign: string;
  status: string;
  outcome: string;
  source: LeadSource;
}

const OUTCOME: Record<string, { label: string; className: string }> = {
  new: { label: "новый", className: "bg-muted text-muted-foreground" },
  qualified: { label: "в работе", className: "bg-info/12 text-info" },
  no_answer: { label: "не ответил", className: "bg-warning/14 text-warning" },
  won: { label: "продажа", className: "bg-positive/12 text-positive" },
  lost: { label: "отказ", className: "bg-negative/12 text-negative" },
  junk: { label: "спам / нецелевой", className: "bg-warning/14 text-warning" },
};

const SOURCE_TONE: Record<LeadSource["tone"], string> = {
  ads: "bg-info/12 text-info",
  ai: "bg-positive/12 text-positive",
  seo: "bg-muted text-foreground",
  other: "bg-warning/14 text-warning",
  unknown: "text-muted-foreground",
};

/** Leads with status chips on top that filter the list; «Все» shows everything. */
export function LeadsTable({ leads }: { leads: LeadRowView[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const counts = leads.reduce<Record<string, number>>((acc, l) => ((acc[l.outcome] = (acc[l.outcome] ?? 0) + 1), acc), {});
  const shown = filter ? leads.filter((l) => l.outcome === filter) : leads;

  const chip = (key: string | null, label: string, n: number, tone: string) => {
    const active = filter === key;
    return (
      <button
        key={key ?? "all"}
        type="button"
        aria-pressed={active}
        onClick={() => setFilter(active ? null : key)}
        className={cn(
          "rounded-full px-2.5 py-1 font-semibold transition",
          tone,
          active ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : filter !== null || key !== null ? "opacity-70 hover:opacity-100" : "",
        )}
      >
        {label}: {n}
      </button>
    );
  };

  return (
    <Card className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Лиды</h2>
        <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Фильтр по статусу">
          {chip(null, "Все", leads.length, "bg-accent text-accent-foreground")}
          {Object.entries(counts).map(([k, n]) => chip(k, OUTCOME[k]?.label ?? k, n, OUTCOME[k]?.className ?? "bg-muted text-muted-foreground"))}
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Когда</th>
              <th className="py-2 pr-3 font-medium">Имя</th>
              <th className="py-2 pr-3 font-medium">Контакт</th>
              <th className="py-2 pr-3 font-medium">Кампания</th>
              <th className="py-2 pr-3 font-medium">Статус</th>
              <th className="py-2 font-medium">Источник</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-3 text-xs tabular-nums text-muted-foreground">{l.when}</td>
                <td className="py-2 pr-3 font-medium">{l.name || "—"}</td>
                <td className="py-2 pr-3 text-xs">{l.contact || "—"}</td>
                <td className="max-w-[180px] truncate py-2 pr-3 text-xs text-muted-foreground">{l.campaign || "—"}</td>
                <td className="py-2 pr-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", OUTCOME[l.outcome]?.className)} title={l.status}>
                    {l.status || OUTCOME[l.outcome]?.label}
                  </span>
                </td>
                <td className="py-2">
                  <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", SOURCE_TONE[l.source.tone])} title={l.source.hint}>
                    {l.source.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
