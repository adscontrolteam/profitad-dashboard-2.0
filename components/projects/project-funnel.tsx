import { Card, StatTile } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app";
import { projectFunnel, type FunnelMonth, type PaymentLag } from "@/lib/integrations/store";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

/**
 * Real results month by month: what the ad cabinet saw vs the leads the client actually got, how many never
 * answered, how many paid and the money. Renders nothing until the project has a lead sheet or CRM.
 */
export async function ProjectFunnel({ projectId, currency }: { projectId: string; currency: string | null }) {
  const funnel = await projectFunnel(projectId, 6);
  if (!funnel.hasLeads) return null;

  const cur = currency || funnel.currency || APP_CONFIG.currency;
  const money = (v: number | null, digits = 0) =>
    v === null || !Number.isFinite(v)
      ? "—"
      : new Intl.NumberFormat(APP_CONFIG.locale, { style: "currency", currency: cur, maximumFractionDigits: digits }).format(v);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const div = (a: number | null, b: number) => (a !== null && b > 0 ? a / b : null);
  const rows = funnel.months.filter((m) => m.leads || m.spend || m.revenue || m.junk || m.clientsAll);

  const sum = (k: keyof FunnelMonth) => rows.reduce((a, m) => a + Number(m[k] ?? 0), 0);
  const total = {
    spend: sum("spend"),
    cabinet: sum("cabinetLeads"),
    leads: sum("leads"),
    adsLeads: sum("adsLeads"),
    noAnswer: sum("noAnswer"),
    clients: sum("clients"),
    clientsAll: sum("clientsAll"),
    clientsRepeat: sum("clientsRepeat"),
    clientsFromEarlier: sum("clientsFromEarlier"),
    revenueAds: sum("revenueAds"),
    revenue: sum("revenue"),
  };
  // Cabinet numbers exist only for months with synced ad data; compare like with like.
  const adMonths = rows.filter((m) => m.spend !== null);
  const adLeadsInAdMonths = adMonths.reduce((a, m) => a + m.adsLeads, 0);
  const newAdClients = adMonths.reduce((a, m) => a + m.clients - m.clientsRepeat, 0);
  const notAds = (all: number, ads: number) => Math.max(all - ads, 0);

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Реальные результаты</h2>
        <p className="text-xs text-muted-foreground">
          Считаем только лиды с рекламы (gclid / платная метка). Лиды и продажи — из таблицы клиента, расход — из кабинетов. Последние 6 месяцев.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Лиды с рекламы">
          {total.adsLeads}
          {adMonths.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">кабинет видит {total.cabinet} из {adLeadsInAdMonths}</span>}
          <Parallel all={total.leads} other={notAds(total.leads, total.adsLeads)} />
        </StatTile>
        <StatTile label="Не ответили (с рекламы)">
          <span className={total.noAnswer / Math.max(total.adsLeads, 1) >= 0.2 ? "text-warning" : undefined}>{total.noAnswer}</span>{" "}
          <span className="text-xs font-normal text-muted-foreground">{pct(total.noAnswer, total.adsLeads)} лидов</span>
        </StatTile>
        <StatTile label="Клиенты с рекламы">
          {total.clients}
          <ClientNotes repeat={total.clientsRepeat} earlier={total.clientsFromEarlier} />
          <Parallel all={total.clientsAll} other={notAds(total.clientsAll, total.clients)} />
        </StatTile>
        <StatTile label="Выручка с рекламы">
          {money(total.revenueAds)}
          {funnel.hasSales && <Parallel all={total.revenue} other={notAds(total.revenue, total.revenueAds)} format={money} />}
        </StatTile>
        <StatTile label="Цена лида с рекламы">{money(div(adMonths.length ? total.spend : null, adLeadsInAdMonths), 2)}</StatTile>
        <StatTile label="ROAS рекламы">{adMonths.length && total.spend ? `${Math.round((total.revenueAds / total.spend) * 100)}%` : "—"}
          {newAdClients > 0 && <span className="block text-[11px] font-normal leading-4 text-muted-foreground/70">клиент с рекламы — {money(total.spend / newAdClients)}</span>}
        </StatTile>
      </div>

      <PaymentLagLine lag={funnel.lag} />

      <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[760px] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Месяц</th>
              <th className="py-2 pr-3 text-right font-medium">Расход</th>
              <th className="py-2 pr-3 text-right font-medium">Лиды в кабинете</th>
              <th className="py-2 pr-3 text-right font-medium">Лиды с рекламы</th>
              <th className="py-2 pr-3 text-right font-medium">Не ответили</th>
              <th className="py-2 pr-3 text-right font-medium">Клиенты с рекламы</th>
              <th className="py-2 pr-3 text-right font-medium">Выручка с рекламы</th>
              <th className="py-2 pr-3 text-right font-medium">Цена лида</th>
              <th className="py-2 text-right font-medium">Цена нового клиента</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((m) => (
              <tr key={m.month} className="align-top">
                <td className="py-2 pr-3 font-medium">{monthLabel(m.month)}</td>
                <td className="py-2 pr-3 text-right">{money(m.spend)}</td>
                <td className="py-2 pr-3 text-right text-muted-foreground">{m.cabinetLeads ?? "—"}</td>
                <td className="py-2 pr-3 text-right">
                  <span className="font-semibold">{m.adsLeads || "—"}</span>
                  <Parallel all={m.leads} other={notAds(m.leads, m.adsLeads)} short />
                </td>
                <td className="py-2 pr-3 text-right">{m.noAnswer ? `${m.noAnswer} · ${pct(m.noAnswer, m.adsLeads)}` : "—"}</td>
                <td className="py-2 pr-3 text-right">
                  {m.clients || "—"}
                  <ClientNotes repeat={m.clientsRepeat} earlier={m.clientsFromEarlier} short />
                  <Parallel all={m.clientsAll} other={notAds(m.clientsAll, m.clients)} short />
                </td>
                <td className="py-2 pr-3 text-right">
                  {m.revenueAds ? money(m.revenueAds) : "—"}
                  {funnel.hasSales && <Parallel all={m.revenue} other={notAds(m.revenue, m.revenueAds)} format={money} short />}
                </td>
                <td className="py-2 pr-3 text-right">{money(div(m.spend, m.adsLeads), 2)}</td>
                <td className="py-2 text-right">{money(div(m.spend, m.clients - m.clientsRepeat), 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        «С рекламы» — у лида есть gclid / gbraid / wbraid или платная UTM-метка; без метки (SEO, прямые заходы, мессенджеры) — «не с рекламы», они
        показаны отдельно серым и в цену лида, клиента и ROAS не входят. Спам и тесты не считаются, один человек в один день — один лид. «Клиенты» — все,
        кто платил в этом месяце (если дата оплаты не заполнена — в месяце заявки); «повт.» — уже платили раньше, «лид ранее» — первая оплата, а заявка
        была в прошлом месяце. «Выручка с рекламы» — по «Дата оплати / Сума EUR» у лидов с рекламы; «всего» — {funnel.hasSales ? "лист продаж клиента" : "появится с листом продаж или оплатами в таблице"}.
      </p>
    </Card>
  );
}

/** «всего 28 · не с рекламы 21» — the whole picture next to the ad-only number, quiet. */
function Parallel({ all, other, format = String, short = false }: { all: number; other: number; format?: (v: number) => string; short?: boolean }) {
  if (!all) return null;
  return (
    <span className="block text-[11px] font-normal leading-4 text-muted-foreground/70">
      всего {format(all)} · не с {short ? "рекл." : "рекламы"} {format(other)}
    </span>
  );
}

/** Quiet hints under the client count: repeat buyers (retention) and first-time buyers whose lead came earlier. */
function ClientNotes({ repeat, earlier, short = false }: { repeat: number; earlier: number; short?: boolean }) {
  if (!repeat && !earlier) return null;
  const parts = [
    repeat ? (short ? `${repeat} повт.` : `${repeat} повторные`) : null,
    earlier ? (short ? `${earlier} — лид ранее` : `${earlier} — лиды прошлых месяцев`) : null,
  ].filter(Boolean);
  return (
    <span
      className="block text-[11px] font-normal leading-4 text-muted-foreground/70"
      title="Повторные — уже платили раньше. Лид ранее — первая оплата в этом месяце, а заявка была раньше."
    >
      {short ? parts.join(" · ") : `из них ${parts.join(", ")}`}
    </span>
  );
}

const days = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней"}`;

/**
 * Lead → payment lag: tells how long after a launch the campaign's real result becomes visible.
 * Needs «Дата оплати» filled for paying leads.
 */
function PaymentLagLine({ lag }: { lag: PaymentLag }) {
  const p = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="mt-3 rounded-[16px] border border-border bg-background/70 px-4 py-3 text-sm">
      <span className="text-xs text-muted-foreground">Срок от заявки до оплаты</span>
      {lag.count === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Появится, когда у оплативших лидов будет заполнена «Дата оплати». Покажет, через сколько после запуска кампании виден её реальный результат.
        </p>
      ) : (
        <p className="mt-1 tabular-nums">
          <span className="font-semibold">в среднем {days(lag.medianDays ?? 0)}</span>
          <span className="text-muted-foreground"> (медиана; среднее {days(lag.avgDays ?? 0)}) · </span>
          за 7 дней платят {p(lag.within7)}, за 30 — {p(lag.within30)}, за 60 — {p(lag.within60)}
          <span className="text-xs text-muted-foreground/70"> · по {lag.count} оплатам</span>
        </p>
      )}
    </div>
  );
}
