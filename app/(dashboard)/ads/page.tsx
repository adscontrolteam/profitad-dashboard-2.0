import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { refreshGoogleIfStale } from "@/lib/google/sync";
import { metaAccountReach, metaCampaignReach, metaCampaignStatuses, metaConfigured } from "@/lib/meta/ads";
import { refreshMetaIfStale } from "@/lib/meta/sync";
import { InfoHint } from "@/components/ui/info-hint";
import { CampaignsTable } from "@/components/ads/campaigns-table";
import { LogFocus } from "@/components/log/log-focus";
import { toLogItems } from "@/lib/log/view";
import { listLog } from "@/lib/log/store";
import { Card } from "@/components/ui/card";
import { BarChart, formatShortDate, KpiTile } from "@/components/workspace/charts";
import { WorkspaceHeader } from "@/components/workspace/header";
import { EmptyProjects, PillTabs } from "@/components/workspace/toolbar";
import { requireSection } from "@/lib/access/viewer";
import { METRICS } from "@/lib/domain/metrics";
import { formatMetric, formatNumber } from "@/lib/format";
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

  // Google numbers older than an hour are pulled again once the page is sent (the nightly run is only daily).
  const { id: projectId, sources } = ws.project;
  after(() => refreshGoogleIfStale(projectId, sources));
  after(() => refreshMetaIfStale(projectId, sources));

  // Money on ad pages is in the currency of the project's ad account, set in «Вводные».
  const currency = ws.project.agent.currency;
  const formatCurrency = (v: number) => formatMetric(v, "currency", currency);
  const resultMetric = ws.project.kpis[0]?.metric ?? "leads";
  const report = await getAdsReport(ws.project, { from: ws.range.from, to: ws.range.to }, platform, resultMetric);
  const campaigns = await withLiveMeta(await withLiveGoogleStatus(report.campaigns), { from: ws.range.from, to: ws.range.to });
  const log = await listLog(ws.project.id, "ads");
  const liveGoogle = report.source === "synced" && adsConfigured();
  const spend = report.days.reduce((a, d) => a + d.spend, 0);
  const results = report.days.reduce((a, d) => a + d.results, 0);
  const impressions = report.days.reduce((a, d) => a + d.impressions, 0);
  const clicks = report.days.reduce((a, d) => a + d.clicks, 0);
  // Reach is people, so it is asked from Meta for the exact period — and only when the page shows one Meta account alone.
  const metaAccounts = [...new Set(campaigns.filter((c) => c.platform === "meta" && c.accountId).map((c) => c.accountId as string))];
  const onlyMeta = report.source === "synced" && campaigns.length > 0 && campaigns.every((c) => c.platform === "meta");
  const reach =
    report.reach ?? (onlyMeta && metaAccounts.length === 1 && metaConfigured() ? (await metaAccountReach(metaAccounts[0], ws.range.from, ws.range.to).catch(() => 0)) || null : null);
  const resultLabel = METRICS[resultMetric]?.label ?? "Результаты";
  // Ad accounts of the project that the open platform tab is about.
  const connectedSources = sources.filter((x) => x.accountId && (platform === "all" || x.platform === platform));
  const platformName = platform === "all" ? "Реклама" : (AD_PLATFORMS.find((p) => p.id === platform)?.label ?? "Реклама");

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
          {report.source === "synced" ? "Данные из синхронизации кабинетов · " : ""}
          {ws.range.label}
        </span>
      </div>

      {report.source !== "synced" && (
        <Card className="flex flex-col items-start gap-3">
          <h2 className="section-title">{connectedSources.length ? "За этот период данных нет" : `${platformName} — не подключено`}</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {connectedSources.length
              ? "Кабинет подключён, но за выбранные даты расходов не было или статистика ещё не загрузилась. Выберите другой период или загляните позже: данные подтягиваются при открытии страницы и каждую ночь."
              : "У проекта не выбран рекламный кабинет. Подключите его во «Вводных» → «Источники трафика» — после этого здесь появятся расходы, результаты и кампании."}
          </p>
          {!connectedSources.length &&
            (permissions.canEditInputs ? (
              <Link href={`/inputs?edit=${encodeURIComponent(ws.project.id)}`} className="btn-primary">
                Подключить
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">Подключение делает администратор.</span>
            ))}
        </Card>
      )}

      <LogFocus projectId={ws.project.id} items={toLogItems(log)} scope="ads" currency={ws.project.agent.currency} />

      {report.source === "synced" && (
        <>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Расход" value={formatCurrency(spend)} hint={ws.range.phrase} />
        <KpiTile label={resultLabel} value={formatNumber(results)} hint="главная цель кампаний" />
        <KpiTile label="Цена результата" value={results ? formatCurrency(spend / results) : "—"} hint="расход / результаты" />
        <KpiTile label="CTR" value={impressions ? pct.format(clicks / impressions) : "—"} hint={`кликов ${formatNumber(clicks)}`} />
        <KpiTile label="CPM" value={impressions ? formatCurrency((spend / impressions) * 1000) : "—"} hint={`показов ${formatNumber(impressions)}`} />
        <KpiTile
          label="Частота"
          value={reach ? (impressions / reach).toFixed(2) : "—"}
          hint={reach ? `охват ${formatNumber(reach)}` : "нет данных об охвате"}
        />
        {resultMetric === "subscribers" && report.profileVisits ? (
          <KpiTile
            label="Конверсия в подписчика"
            value={pct.format(results / report.profileVisits)}
            hint={`подписки ÷ посещения профиля · ${formatNumber(report.profileVisits)} посещений`}
          />
        ) : null}
      </section>

      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">По дням <InfoHint className="ml-1">Столбик — расход за день, цифра — {resultLabel.toLowerCase()}</InfoHint></h2>
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
                ? ""
                : "Управление появится после настройки Google Ads API"}
          </p>
        </div>
        <CampaignsTable
          projectId={ws.project.id}
          currency={currency}
          campaigns={campaigns}
          resultLabel={resultLabel}
          canManage={permissions.canManageAds && liveGoogle}
          live={liveGoogle}
          visitConversion={resultMetric === "subscribers"}
        />
      </Card>
        </>
      )}
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

/** Status, reach and frequency of synced Meta campaigns straight from Meta for the shown period; skipped quietly when Meta does not answer. */
async function withLiveMeta(campaigns: AdCampaign[], range: { from: string; to: string }): Promise<AdCampaign[]> {
  if (!metaConfigured()) return campaigns;
  const accounts = [...new Set(campaigns.filter((c) => c.platform === "meta" && c.accountId).map((c) => c.accountId as string))];
  const live = new Map<string, { statuses?: Map<string, string>; reach?: Map<string, { reach: number; frequency: number }> }>();
  await Promise.all(
    accounts.map(async (a) => {
      const [statuses, reach] = await Promise.all([
        metaCampaignStatuses(a).catch(() => undefined),
        metaCampaignReach(a, range.from, range.to).catch(() => undefined),
      ]);
      live.set(a, { statuses, reach });
    }),
  );
  return campaigns.map((c) => {
    if (c.platform !== "meta" || !c.accountId || !c.externalId) return c;
    const mine = live.get(c.accountId);
    const status = mine?.statuses?.get(c.externalId);
    const reach = mine?.reach?.get(c.externalId);
    return {
      ...c,
      status: status ? (status === "ACTIVE" ? "active" : "paused") : c.status,
      frequency: reach?.frequency ? reach.frequency : c.frequency,
    };
  });
}
