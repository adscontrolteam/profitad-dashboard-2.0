"use client";

import { useState, useTransition } from "react";
import { setGoogleCampaignStatusAction } from "@/app/(dashboard)/ads/actions";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { AdCampaign, CampaignStatus } from "@/lib/workspace/demo";

const pct = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 2 });

const STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  active: { label: "работает", className: "bg-positive/12 text-positive" },
  learning: { label: "обучение", className: "bg-warning/14 text-warning" },
  paused: { label: "пауза", className: "bg-negative/12 text-negative" },
};

export function CampaignsTable({
  projectId,
  campaigns,
  resultLabel,
  canManage,
  live = false,
}: {
  projectId: string;
  campaigns: AdCampaign[];
  resultLabel: string;
  canManage: boolean;
  /** Real Google campaigns: toggles go to the Google Ads API. */
  live?: boolean;
}) {
  const [overrides, setOverrides] = useState<Record<string, CampaignStatus>>({});
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
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Название</th>
            <th className="py-2 pr-3 font-medium">Статус</th>
            <th className="py-2 pr-3 text-right font-medium">Расход</th>
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
              <tr key={c.id} className="tabular-nums">
                <td className="max-w-[280px] py-3 pr-3">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.platform === "google" ? "Google Ads" : "Meta Ads"}</p>
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
                <td className="py-3 pr-3 text-right">{formatNumber(c.results)}</td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
