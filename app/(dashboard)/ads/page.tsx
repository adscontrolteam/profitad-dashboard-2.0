import type { Metadata } from "next";
import { CampaignsTable } from "@/components/ads/campaigns-table";
import { Card } from "@/components/ui/card";
import { BarChart, formatShortDate, KpiTile } from "@/components/workspace/charts";
import { WorkspaceHeader } from "@/components/workspace/header";
import { DemoNotice, EmptyProjects, PillTabs } from "@/components/workspace/toolbar";
import { requireSection } from "@/lib/access/viewer";
import { METRICS } from "@/lib/domain/metrics";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getAdsReport } from "@/lib/workspace/ads-store";
import type { AdCampaign } from "@/lib/workspace/demo";
import { adsConfigured, campaignStatuses } from "@/lib/google/ads";
import { resolveWorkspace } from "@/lib/workspace/context";
import { AD_PLATFORMS, first, isAdPlatform, workspaceHref } from "@/lib/workspace/params";

export const metadata: Metadata = { title: "Реклама" };

const pct = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 2 });

export default async function AdsAnalyticsPage({ searchParams }: PageProps<"/ads">) {
  const params = await searchParams;
  const { permissions } = await requireSection("ads");
  const ws = await resolveWorkspace(params, permissions);
  const rawPlatform = first(params.platform);
  const platform = isAdPlatform(rawPlatform) ? rawPlatform : "all";
  const extraQuery = { platform: platform === "all" ? undefined : platform };

  const header = (
    <WorkspaceHeader
      section="ads"
      pathname="/ads"
      workspace={ws}
      permissions={permissions}
      withRange
      extraQuery={extraQuery}
    />
  );

  if (!ws.project) return <div className="flex flex-col gap-5">{header}<EmptyProjects /></div>;

  const resultMetric = ws.project.kpis[0]?.metric ?? "leads";
  const report = await getAdsReport(ws.project, { from: ws.range.from, to: ws.range.to }, platform, resultMetric);
  const campaigns = await withLiveGoogleStatus(report.campaigns);
  const liveGoogle = report.source === "synced" && adsConfigured();
  const spend = report.days.reduce((a, d) => a + d.spend, 0);
  const results = report.days.reduce((a, d) => a + d.results, 0);
  const impressions = report.days.reduce((a, d) => a + d.impressions, 0);
  const clicks = report.days.reduce((a, d) => a + d.clicks, 0);
  const resultLabel = METRICS[resultMetric]?.label ?? "Результаты";

  return (
    <div className="flex flex-col gap-5">
      {header}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs
          label="Платформа"
          className="w-fit"
          items={AD_PLATFORMS.map((p) => ({
            href: workspaceHref("/ads", { ...ws.query }, { platform: p.id === "all" ? undefined : p.id }),
            label: p.label,
            active: p.id === platform,
          }))}
        />
        <span className="text-xs text-muted-foreground">
          {report.source === "synced" ? "Данные из синхронизации кабинетов" : "Демо-данные"} · {ws.range.label}
        </span>
      </div>

      {report.source === "demo" && <DemoNotice />}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Расход" value={formatCurrency(spend)} hint={ws.range.preset ? `за ${ws.range.label.toLowerCase()}` : ws.range.label} />
        <KpiTile label={resultLabel} value={formatNumber(results)} hint="главная цель кампаний" />
        <KpiTile label="Цена результата" value={results ? formatCurrency(spend / results) : "—"} hint="расход / результаты" />
        <KpiTile label="CTR" value={impressions ? pct.format(clicks / impressions) : "—"} hint={`кликов ${formatNumber(clicks)}`} />
        <KpiTile label="CPM" value={impressions ? formatCurrency((spend / impressions) * 1000) : "—"} hint={`показов ${formatNumber(impressions)}`} />
        <KpiTile
          label="Частота"
          value={report.reach ? (impressions / report.reach).toFixed(2) : "—"}
          hint={report.reach ? `охват ${formatNumber(report.reach)}` : "нет данных об охвате"}
        />
      </section>

      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">По дням</h2>
          <p className="text-xs text-muted-foreground">Столбик — расход за день, цифра — {resultLabel.toLowerCase()}</p>
        </div>
        <BarChart
          valueLabel
          bars={report.days.map((d) => ({ date: d.date, value: d.spend, label: String(Math.round(d.results)) }))}
          barTitle={(b) => `${formatShortDate(b.date)}: ${formatCurrency(b.value)} · ${b.label}`}
        />
      </Card>

      <Card className="min-w-0">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">Кампании</h2>
          <p className="text-xs text-muted-foreground">
            {!permissions.canManageAds
              ? "Только просмотр"
              : liveGoogle
                ? "Пауза и включение уходят прямо в Google Ads"
                : report.source === "demo"
                  ? "Демо: пауза и включение без отправки"
                  : "Управление появится после настройки Google Ads API"}
          </p>
        </div>
        <CampaignsTable
          projectId={ws.project.id}
          campaigns={campaigns}
          resultLabel={resultLabel}
          canManage={permissions.canManageAds && (report.source === "demo" || liveGoogle)}
          live={liveGoogle}
        />
      </Card>
    </div>
  );
}

/** Current status straight from Google Ads for synced Google campaigns; silently skipped if the API is not set up. */
async function withLiveGoogleStatus(campaigns: AdCampaign[]): Promise<AdCampaign[]> {
  if (!adsConfigured()) return campaigns;
  const accounts = [...new Set(campaigns.filter((c) => c.platform === "google" && c.accountId).map((c) => c.accountId as string))];
  const statuses = new Map<string, Map<string, string>>();
  await Promise.all(
    accounts.map(async (a) => {
      try {
        statuses.set(a, await campaignStatuses(a));
      } catch {
        // keep the table usable without live status
      }
    }),
  );
  return campaigns.map((c) => {
    const s = c.accountId && c.externalId ? statuses.get(c.accountId)?.get(c.externalId) : undefined;
    return s ? { ...c, status: s === "ENABLED" ? "active" : "paused" } : c;
  });
}
