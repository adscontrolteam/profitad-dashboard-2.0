"use client";

import { Fragment, useState, useTransition } from "react";
import { BarChart, formatShortDate } from "@/components/workspace/charts";
import { setGoogleCampaignStatusAction } from "@/app/(dashboard)/ads/actions";
import { cn } from "@/lib/cn";
import { formatMetric, formatNumber } from "@/lib/format";
import type { AdCampaign, AdDay, CampaignStatus } from "@/lib/workspace/demo";

const pct = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 2 });

const STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  active: { label: "работает", className: "bg-positive/12 text-positive" },
  learning: { label: "обучение", className: "bg-warning/14 text-warning" },
  paused: { label: "пауза", className: "bg-negative/12 text-negative" },
};

type ChartMetric = "results" | "cpr" | "spend" | "clicks" | "cpc";

const CHART_VALUE: Record<ChartMetric, (d: AdDay) => number> = {
  results: (d) => d.results,
  cpr: (d) => (d.results ? d.spend / d.results : 0),
  spend: (d) => d.spend,
  clicks: (d) => d.clicks,
  cpc: (d) => (d.clicks ? d.spend / d.clicks : 0),
};

export function CampaignsTable({
  projectId,
  campaigns,
  resultLabel,
  canManage,
  live = false,
  currency = null,
  visitConversion = false,
}: {
  projectId: string;
  /** Currency of the project's ad account. */
  currency?: string | null;
  campaigns: AdCampaign[];
  resultLabel: string;
  canManage: boolean;
  /** Real Google campaigns: toggles go to the Google Ads API. */
  live?: boolean;
  /** Results are followers: show which share of the Instagram profile visits became one. */
  visitConversion?: boolean;
}) {
  const formatCurrency = (v: number) => formatMetric(v, "currency", currency);
  const [overrides, setOverrides] = useState<Record<string, CampaignStatus>>({});
  const [chartOf, setChartOf] = useState<string | null>(null);
  const [metric, setMetric] = useState<ChartMetric>("results");
  const chartMetrics: { id: ChartMetric; label: string; money: boolean }[] = [
    { id: "results", label: resultLabel, money: false },
    { id: "cpr", label: "Цена рез.", money: true },
    { id: "spend", label: "Расход", money: true },
    { id: "clicks", label: "Клики", money: false },
    { id: "cpc", label: "Цена клика", money: true },
  ];
  const activeMetric = chartMetrics.find((m) => m.id === metric) ?? chartMetrics[0];
  const columns = canManage ? 11 : 10;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (c: AdCampaign, paused: boolean) => {
    const next: CampaignStatus = paused ? "active" : "paused";
    if (!live) {
      setOverrides((o) => ({ ...o, [c.id]: next }));
      return;
    }
    if (c.platform !== "google" || !c.accountId || !c.externalId) return;
    if (!window.confirm(`${paused ? "Включить" : "Поставить на паузу"} «${c.name}» в Google Ads?`)) return;
    setBusy(c.id);
    setError(null);
    startTransition(async () => {
      const r = await setGoogleCampaignStatusAction(projectId, c.accountId!, c.externalId!, paused ? "ENABLED" : "PAUSED");
      setBusy(null);
      if (r.ok) setOverrides((o) => ({ ...o, [c.id]: next }));
      else setError(r.message);
    });
  };

  if (campaigns.length === 0) {
    return <p className="text-sm text-muted-foreground">За период кампаний нет.</p>;
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {error && <p role="alert" className="mb-2 text-sm font-medium text-negative">{error}</p>}
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Название</th>
            <th className="py-2 pr-3 font-medium">Статус</th>
            <th className="py-2 pr-3 text-right font-medium">Расход</th>
            <th className="py-2 pr-3 text-right font-medium">Клики</th>
            <th className="py-2 pr-3 text-right font-medium">Цена клика</th>
            <th className="py-2 pr-3 text-right font-medium">{resultLabel}</th>
            <th className="py-2 pr-3 text-right font-medium">Цена рез.</th>
            <th className="py-2 pr-3 text-right font-medium">CTR</th>
            <th className="py-2 pr-3 text-right font-medium">CPM</th>
            <th className="py-2 pr-3 text-right font-medium">Част.</th>
            {canManage && <th className="py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {campaigns.map((c) => {
            const status = overrides[c.id] ?? c.status;
            const paused = status === "paused";
            return (
              <Fragment key={c.id}>
              <tr className="tabular-nums">
                <td className="max-w-[280px] py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.platform === "google" ? "Google Ads" : "Meta Ads"}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Динамика кампании «${c.name}»`}
                      aria-expanded={chartOf === c.id}
                      title="Динамика по дням"
                      onClick={() => setChartOf((v) => (v === c.id ? null : c.id))}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full border border-border transition-colors hover:bg-muted",
                        chartOf === c.id ? "bg-accent text-accent-foreground hover:bg-accent" : "text-muted-foreground",
                      )}
                    >
                      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                        <path d="M3 13V9M8 13V3M13 13V6" />
                      </svg>
                    </button>
                  </div>
                </td>
                <td className="py-3 pr-3">
                  {status ? (
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[status].className)}>
                      {STATUS[status].label}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 pr-3 text-right">{formatCurrency(c.spend)}</td>
                <td className="py-3 pr-3 text-right">{formatNumber(c.clicks)}</td>
                <td className="py-3 pr-3 text-right">{c.clicks ? formatCurrency(c.spend / c.clicks) : "—"}</td>
                <td className="py-3 pr-3 text-right">
                  {formatNumber(c.results)}
                  {visitConversion && c.profileVisits ? (
                    <span className="block text-[11px] text-muted-foreground" title={`Посещений профиля Instagram: ${formatNumber(c.profileVisits)}`}>
                      {pct.format(c.results / c.profileVisits)} из посещений
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-3 text-right">{c.results ? formatCurrency(c.spend / c.results) : "—"}</td>
                <td className="py-3 pr-3 text-right">{c.impressions ? pct.format(c.clicks / c.impressions) : "—"}</td>
                <td className="py-3 pr-3 text-right">
                  {c.impressions ? formatCurrency((c.spend / c.impressions) * 1000) : "—"}
                </td>
                <td className="py-3 pr-3 text-right">{c.frequency?.toFixed(2) ?? "—"}</td>
                {canManage && (
                  <td className="py-3 text-right">
                    {(!live || (c.platform === "google" && c.externalId && status)) && (
                      <button
                        type="button"
                        className="btn-ghost px-3 py-1 text-xs"
                        disabled={busy === c.id}
                        onClick={() => toggle(c, paused)}
                      >
                        {busy === c.id ? "…" : paused ? "Включить" : "Пауза"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {chartOf === c.id && (
                <tr>
                  <td colSpan={columns} className="pb-5">
                    <div className="rounded-[18px] bg-muted/50 p-4">
                      <div role="tablist" aria-label="Показатель" className="mb-3 flex flex-wrap gap-1.5">
                        {chartMetrics.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            role="tab"
                            aria-selected={m.id === metric}
                            onClick={() => setMetric(m.id)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                              m.id === metric ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <BarChart
                        height={130}
                        valueLabel
                        bars={c.days.map((d) => {
                          const value = CHART_VALUE[metric](d);
                          return {
                            date: d.date,
                            value,
                            label: value ? (activeMetric.money ? value.toFixed(value < 10 ? 2 : 0) : formatNumber(value)) : "",
                          };
                        })}
                        barTitle={(b) =>
                          `${formatShortDate(b.date)}: ${activeMetric.label.toLowerCase()} — ${activeMetric.money ? formatCurrency(b.value) : formatNumber(b.value)}`
                        }
                      />
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
