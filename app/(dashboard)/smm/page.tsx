import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { after } from "next/server";
import { SmmAnalytics } from "@/components/smm/analytics";
import { StatsRefresh } from "@/components/social/stats-refresh";
import { SocialConnections } from "@/components/social/social-connections";
import { NetworkIcon } from "@/components/smm/network-icon";
import { Card } from "@/components/ui/card";
import { WorkspaceHeader } from "@/components/workspace/header";
import { EmptyProjects, PillTabs } from "@/components/workspace/toolbar";
import { requireSection } from "@/lib/access/viewer";
import { LogFocus } from "@/components/log/log-focus";
import { listLog } from "@/lib/log/store";
import { toLogItems } from "@/lib/log/view";
import { businessPagesConfigured } from "@/lib/social/business";
import { providerConfigured } from "@/lib/social/oauth";
import { liveSmmReport } from "@/lib/social/report";
import { refreshSocialStats } from "@/lib/social/stats";
import { ensureConnectLink, listSocialAccounts } from "@/lib/social/store";
import { resolveWorkspace } from "@/lib/workspace/context";
import { first, isSocialNetwork, SOCIAL_NETWORKS, workspaceHref, type SocialNetwork } from "@/lib/workspace/params";

export const metadata: Metadata = { title: "SMM" };

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

  const canManage = permissions.canEditInputs;
  const accounts = await listSocialAccounts(ws.project.id);
  const connectLink = canManage ? await ensureConnectLink(ws.project.id) : null;
  /** Networks with a working account in this project. */
  const live = new Set<SocialNetwork>(accounts.filter((x) => x.status === "ok").map((x) => x.network));
  // The connect block is only for the networks it can connect, and only until the open one is connected; after that it lives in «Вводные».
  const showConnections = (net === "instagram" || net === "facebook" || net === "threads") && !live.has(net);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  // A connected Facebook Page or Instagram account shows its own numbers; nothing else is drawn — no made-up data.
  const liveReport = net === "facebook" || net === "instagram" ? await liveSmmReport(ws.project.id, net, { from: ws.range.from, to: ws.range.to }) : null;
  // Numbers older than an hour are pulled again once the page is sent (the nightly run is only daily).
  const projectId = ws.project.id;
  if (liveReport) after(() => refreshSocialStats(projectId).then(() => undefined, (e) => console.error("social stats", projectId, (e as Error).message)));
  const netLabel = SOCIAL_NETWORKS.find((n) => n.id === net)?.label ?? "";
  const connectable = net === "instagram" || net === "facebook" || net === "threads";

  return (
    <div className="flex flex-col gap-5">
      {header}

      <PillTabs
        label="Соцсеть"
        items={SOCIAL_NETWORKS.map((n) => {
          const isOn = live.has(n.id);
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

      {liveReport ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[18px] border border-dashed border-border bg-card/60 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
          <span className={`size-1.5 shrink-0 rounded-full ${liveReport.error ? "bg-negative" : "bg-positive"}`} aria-hidden />
          <span>
            {liveReport.syncedAt
              ? `Данные из ${net === "facebook" ? "Facebook" : "Instagram"} ${liveReport.handle} · обновлено ${new Date(liveReport.syncedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" })}`
              : "Первая загрузка статистики идёт в фоне — нажмите «Обновить» через минуту."}
            {!liveReport.dailyViews && liveReport.syncedAt ? " · просмотры показаны по дате публикации" : ""}
          </span>
          <StatsRefresh projectId={ws.project.id} shown={liveReport.error} />
          {liveReport.error && <span className="basis-full text-negative">{liveReport.error}</span>}
        </p>
      ) : (
        <Card className="flex flex-col items-start gap-2">
          <h2 className="section-title">{live.has(net) ? `${netLabel} подключён` : `${netLabel} — не подключено`}</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {live.has(net)
              ? "Аккаунт подключён, но статистика этой соцсети пока не загружается в дашборд."
              : connectable
                ? canManage
                  ? "Подключите аккаунт проекта ниже — после этого здесь появится статистика."
                  : "Подключение делает администратор во «Вводных»."
                : "Подключение этой соцсети в дашборде пока недоступно."}
          </p>
          {!live.has(net) && connectable && canManage && !showConnections && (
            <Link href={`/inputs?edit=${encodeURIComponent(ws.project.id)}`} className="btn-primary">
              Подключить
            </Link>
          )}
        </Card>
      )}

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

      <LogFocus projectId={ws.project.id} items={toLogItems(await listLog(ws.project.id, "smm"))} scope="smm" currency={ws.project.agent.currency} />

      {liveReport && <SmmAnalytics data={liveReport.analytics} />}
    </div>
  );
}
