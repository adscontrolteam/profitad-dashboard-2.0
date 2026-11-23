import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { SmmAnalytics } from "@/components/smm/analytics";
import { StatsRefresh } from "@/components/social/stats-refresh";
import { SocialConnections } from "@/components/social/social-connections";
import { NetworkIcon } from "@/components/smm/network-icon";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/signal";
import { AreaChart, BarChart, formatCompact, formatShortDate, KpiTile } from "@/components/workspace/charts";
import { WorkspaceHeader } from "@/components/workspace/header";
import { DemoNotice, EmptyProjects, PillTabs } from "@/components/workspace/toolbar";
import { requireSection } from "@/lib/access/viewer";
import { LogFocus } from "@/components/log/log-focus";
import { listLog } from "@/lib/log/store";
import { toLogItems } from "@/lib/log/view";
import { formatNumber } from "@/lib/format";
import { businessPagesConfigured } from "@/lib/social/business";
import { providerConfigured } from "@/lib/social/oauth";
import { liveSmmReport } from "@/lib/social/report";
import { refreshSocialStats } from "@/lib/social/stats";
import { ensureConnectLink, listSocialAccounts } from "@/lib/social/store";
import { resolveWorkspace } from "@/lib/workspace/context";
import { demoConnectedNetworks, demoSmmReport } from "@/lib/workspace/demo";
import { first, isSocialNetwork, SOCIAL_NETWORKS, workspaceHref, type SocialNetwork } from "@/lib/workspace/params";

export const metadata: Metadata = { title: "SMM" };

const pct = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

export default async function SmmAnalyticsPage({ searchParams }: PageProps<"/smm">) {
  const params = await searchParams;
  const { permissions } = await requireSection("smm");
  const ws = await resolveWorkspace(params, permissions);
  const rawNet = first(params.net);
  const net: SocialNetwork = isSocialNetwork(rawNet) ? rawNet : "instagram";
  const extraQuery = { net: net === "instagram" ? undefined : net };

  const header = (
    <WorkspaceHeader section="smm" pathname="/smm" workspace={ws} permissions={permissions} withRange extraQuery={extraQuery} />
  );
  if (!ws.project) return <div className="flex flex-col gap-5">{header}<EmptyProjects /></div>;

  const connected = demoConnectedNetworks(ws.project.id);
  const canManage = permissions.canEditInputs;
  const accounts = await listSocialAccounts(ws.project.id);
  const connectLink = canManage ? await ensureConnectLink(ws.project.id) : null;
  /** Networks with a working account in this project. */
  const live = new Set<SocialNetwork>(accounts.filter((x) => x.status === "ok").map((x) => x.network));
  // The connect block is only for the networks it can connect, and only until the open one is connected; after that it lives in «Вводные».
  const showConnections = (net === "instagram" || net === "facebook" || net === "threads") && !live.has(net);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  // A connected Facebook Page or Instagram account shows its own numbers; everything else is still the demo.
  const liveReport = net === "facebook" || net === "instagram" ? await liveSmmReport(ws.project.id, net, { from: ws.range.from, to: ws.range.to }) : null;
  const report = liveReport ?? demoSmmReport(ws.project.id, ws.project.name, net, { from: ws.range.from, to: ws.range.to });
  // Numbers older than an hour are pulled again once the page is sent (the nightly run is only daily).
  const projectId = ws.project.id;
  if (liveReport) after(() => refreshSocialStats(projectId).then(() => undefined, (e) => console.error("social stats", projectId, (e as Error).message)));
  const views = report.days.reduce((a, d) => a + d.views, 0);
  const likes = report.days.reduce((a, d) => a + d.likes, 0);
  const comments = report.days.reduce((a, d) => a + d.comments, 0);
  const posts = report.days.reduce((a, d) => a + d.posts, 0);
  const growth = report.prevViews ? views / report.prevViews - 1 : 0;
  const er = views ? (likes + comments + report.shares + report.saves) / views : 0;

  return (
    <div className="flex flex-col gap-5">
      {header}

      <PillTabs
        label="Соцсеть"
        items={SOCIAL_NETWORKS.map((n) => {
          const isOn = connected.includes(n.id) || live.has(n.id);
          return {
            href: workspaceHref("/smm", ws.query, { net: n.id === "instagram" ? undefined : n.id }),
            active: n.id === net,
            muted: !isOn,
            label: (
              <>
                <NetworkIcon network={n.id} className="size-4" />
                {n.label}
                {!isOn && <span className="text-[11px] opacity-70">· подключить</span>}
              </>
            ),
          };
        })}
      />

      {showConnections && (
        <SocialConnections
          key={ws.project.id}
          projectId={ws.project.id}
          origin={origin}
          token={connectLink?.token ?? null}
          seenAt={connectLink?.seenAt?.toISOString() ?? null}
          accounts={accounts}
          ready={{ meta: providerConfigured("meta"), threads: providerConfigured("threads"), business: businessPagesConfigured() }}
          canManage={canManage}
        />
      )}

      {liveReport ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[18px] border border-dashed border-border bg-card/60 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
          <span className={`size-1.5 shrink-0 rounded-full ${liveReport.error ? "bg-negative" : "bg-positive"}`} aria-hidden />
          <span>
            {liveReport.syncedAt
              ? `Данные из ${net === "facebook" ? "Facebook" : "Instagram"} ${liveReport.handle} · обновлено ${new Date(liveReport.syncedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" })}`
              : "Первая загрузка статистики идёт в фоне — нажмите «Обновить» через минуту."}
            {!liveReport.dailyViews && liveReport.syncedAt ? " · просмотры показаны по дате публикации" : ""}
          </span>
          <StatsRefresh projectId={ws.project.id} />
          {liveReport.error && <span className="basis-full text-negative">{liveReport.error}</span>}
        </p>
      ) : (
        <DemoNotice />
      )}

      <LogFocus projectId={ws.project.id} items={toLogItems(await listLog(ws.project.id, "smm"))} scope="smm" currency={ws.project.agent.currency} />

      {liveReport ? (
        <SmmAnalytics data={liveReport.analytics} />
      ) : !report.connected ? (
        <Card className="flex flex-col items-start gap-3">
          <h2 className="section-title">{SOCIAL_NETWORKS.find((n) => n.id === net)?.label} не подключён</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Подключите аккаунт проекта, чтобы видеть статистику и публиковать из дашборда. Подключение делает администратор через
            официальный OAuth соцсети — пароли в дашборде не хранятся.
          </p>
          <button type="button" className="btn-primary" disabled>
            Подключить (скоро)
          </button>
        </Card>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card className="min-w-0">
              <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
                <div>
                  <p className="text-[13px] text-muted-foreground">Просмотры · {ws.range.phrase}</p>
                  <p className="mt-1 font-[family-name:var(--font-manrope)] text-[40px] leading-[44px] font-bold tracking-[-0.04em] tabular-nums">
                    {formatCompact(views)}
                  </p>
                  <Delta value={growth} suffix="к прошлому периоду" className="mt-2" />
                  <p className="mt-6 text-[13px] text-muted-foreground">В среднем на публикацию</p>
                  <p className="text-xl font-bold tabular-nums">{posts ? formatNumber(views / posts) : "—"}</p>
                </div>
                <div className="min-w-[240px] flex-1 pt-6">
                  <AreaChart points={report.days.map((d) => d.views)} labels={report.days.map((d) => d.date)} />
                </div>
              </div>
            </Card>
            <Card className="flex flex-col items-center justify-center text-center">
              <p className="text-[13px] text-muted-foreground">Подписчики · {report.handle}</p>
              <FollowersRing value={report.followers} delta={report.followersDelta} />
            </Card>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile label="Публикации" value={formatNumber(posts)} hint="без сторис" />
            <KpiTile label="Лайки" value={formatCompact(likes)} hint="под публикациями периода" />
            <KpiTile label="Комментарии" value={formatCompact(comments)} />
            <KpiTile label="Вовлечённость (ER)" value={pct.format(er)} hint="реакции / просмотры" />
            <KpiTile label="Репосты" value={formatCompact(report.shares)} />
            <KpiTile label="Сохранения" value={formatCompact(report.saves)} />
            <KpiTile label="Прирост подписчиков" value={`${report.followersDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(report.followersDelta))}`} />
            <KpiTile label="На 1000 просмотров" value={views ? `${((report.followersDelta / views) * 1000).toFixed(1)}` : "—"} hint="новых подписчиков" />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Card className="min-w-0">
              <h2 className="section-title mb-4">Лайки по дням</h2>
              <BarChart
                bars={report.days.map((d) => ({ date: d.date, value: d.likes }))}
                barTitle={(b) => `${formatShortDate(b.date)}: ${formatNumber(b.value)}`}
                height={140}
              />
            </Card>
            <Card className="min-w-0">
              <h2 className="section-title mb-4">Комментарии по дням</h2>
              <BarChart
                bars={report.days.map((d) => ({ date: d.date, value: d.comments }))}
                barTitle={(b) => `${formatShortDate(b.date)}: ${formatNumber(b.value)}`}
                height={140}
              />
            </Card>
          </section>

          <Card className="min-w-0">
            <h2 className="section-title mb-4">Что заходит — лучшие публикации</h2>
            {report.top.length === 0 && <p className="text-sm text-muted-foreground">За этот период публикаций нет.</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {report.top.map((post, i) => (
                <article key={post.id} className="flex min-w-0 flex-col gap-2">
                  <div
                    className="relative aspect-[9/14] overflow-hidden rounded-[18px]"
                    style={{ background: `linear-gradient(160deg, hsl(${post.hue} 45% 35%), hsl(${(post.hue + 40) % 360} 40% 12%))` }}
                  >
                    {post.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- the network's own short-lived preview address
                      <img src={post.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
                    )}
                    <span className="absolute top-2 left-2 rounded-full bg-cta px-2 py-0.5 text-[10px] font-bold text-cta-foreground">
                      №{i + 1}
                    </span>
                    <span className="absolute bottom-2 left-2 text-sm font-semibold text-white tabular-nums">▶ {formatNumber(post.views)}</span>
                  </div>
                  <p className="line-clamp-2 text-[13px] font-medium">
                    {post.permalink ? (
                      <a href={post.permalink} target="_blank" rel="noreferrer" className="hover:underline">
                        {post.title}
                      </a>
                    ) : (
                      post.title
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {post.kind} · {formatShortDate(post.date)} · ♥ {formatNumber(post.likes)} · 💬 {formatNumber(post.comments)}
                  </p>
                </article>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function FollowersRing({ value, delta }: { value: number; delta: number }) {
  const dots = 28;
  const filled = Math.min(dots, Math.round((delta / Math.max(1, value)) * dots * 6) + 6);
  return (
    <div className="relative mt-3 size-52">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        {Array.from({ length: dots }, (_, i) => {
          const a = Math.PI * 0.8 + (i / (dots - 1)) * Math.PI * 1.4;
          return (
            <circle
              key={i}
              cx={100 + Math.cos(a) * 82}
              cy={100 + Math.sin(a) * 82}
              r={5}
              className={i < filled ? "fill-accent" : "fill-track"}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">всего</span>
        <span className="font-[family-name:var(--font-manrope)] text-[28px] leading-9 font-bold tracking-[-0.04em] tabular-nums">
          {formatCompact(value)}
        </span>
        <span className="mt-1 text-xs font-semibold text-positive">+{formatNumber(delta)}</span>
      </div>
    </div>
  );
}
