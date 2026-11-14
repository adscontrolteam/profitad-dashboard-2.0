import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanFactChart } from "@/components/finance/charts";
import { TermsButton } from "@/components/finance/terms-editor";
import { CardHead, dateLabel, Empty, KpiTile, monthLabel, Pill, Table } from "@/components/finance/ui";
import { Card, StatTile } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { getProject } from "@/lib/data";
import { METRICS, PLATFORM_LABELS } from "@/lib/domain/metrics";
import { STATUS_META } from "@/lib/domain/statuses";
import { money, toBase } from "@/lib/finance/fx";
import { KPI_LABEL, KPI_TONE, termsSummary } from "@/lib/finance/labels";
import { buildFinanceReport } from "@/lib/finance/report";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Financial · Клиент" };

const pctTone = (p: number) => (p >= 100 ? "good" : p >= 90 ? "warning" : "bad");

/** Everything about one client in one place: goals, services, results plan/fact, money, invoices. */
export default async function FinanceClientPage({ params }: PageProps<"/finance/clients/[projectId]">) {
  await requireSection("finance");
  const { projectId } = await params;
  const [r, project] = await Promise.all([buildFinanceReport(), getProject(projectId)]);
  const p = r.projects.find((x) => x.id === projectId);
  if (!p || !project) notFound();

  const months = [...p.months].filter((m) => m.month >= p.startMonth).reverse();
  const invoices = r.invoices.filter((i) => i.projectId === p.id);
  const buyer = r.people.find((x) => x.email === p.mediaBuyerEmail);
  const costOf = (month: string) => buyer?.lines.filter((l) => l.projectId === p.id && l.month === month).reduce((a, l) => a + l.amountBase, 0) ?? 0;

  const closed = months.filter((m) => !m.forecast);
  const accruedAll = months.reduce((a, m) => a + m.accrualBase, 0);
  const accruedClosed = closed.reduce((a, m) => a + m.accrualBase, 0);
  const receivedAll = months.reduce((a, m) => a + m.receivedBase, 0);
  const costAll = months.reduce((a, m) => a + costOf(m.month), 0);
  const debt = Math.max(0, accruedClosed - closed.reduce((a, m) => a + m.receivedBase, 0));
  const judged = closed.filter((m) => m.kpi !== "unknown");
  const metCount = judged.filter((m) => m.kpi === "met").length;
  const metric = months.find((m) => m.data?.kpi)?.data?.kpi?.metric;
  const cur = p.currency;
  const chart = [...months].reverse().slice(-12);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/finance/clients" className="btn-ghost px-3 py-1.5">
          ← Клиенты
        </Link>
        <h2 className="font-display text-2xl font-extrabold tracking-[-0.03em]">{p.name}</h2>
        <Pill tone={p.status === "active" ? "good" : "info"}>{STATUS_META[project.status].label}</Pill>
        <span className="text-sm text-muted-foreground">{termsSummary(p.terms) ?? "условия не заполнены"}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          <TermsButton label={p.terms ? "Изменить условия" : "Заполнить условия"} primary={!p.terms} target={{ id: p.id, name: p.name, startMonth: p.startMonth, currency: p.currency, terms: p.terms }} />
          <Link href={`/finance/invoices/new?project=${p.id}`} className="btn-ghost px-3 py-1.5">
            + Инвойс
          </Link>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
        <KpiTile label="Доход за всё время" value={money(accruedAll)}>
          <span>начислено по условиям, {months.length} мес.</span>
        </KpiTile>
        <KpiTile label="Получено" value={money(receivedAll)}>
          <span>оплаченные счета</span>
        </KpiTile>
        <KpiTile label="Не оплачено" value={money(debt)} tone={debt > 0 ? "negative" : undefined}>
          <span>за закрытые месяцы</span>
        </KpiTile>
        <KpiTile label="Маржа" value={money(accruedAll - costAll)} highlight>
          <Pill tone="lime">{accruedAll ? `${Math.round(((accruedAll - costAll) / accruedAll) * 100)}%` : "—"}</Pill>
          <span>после зарплаты медиабайера {money(costAll)}</span>
        </KpiTile>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-5">
        <Card>
          <CardHead title="Цели и услуги" hint="Из «Вводных» проекта">
            <Link href="/inputs" className="btn-ghost px-3 py-1.5">
              Вводные →
            </Link>
          </CardHead>
          <p className="text-sm leading-6">{project.goal || <span className="text-muted-foreground">Цель не описана.</span>}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatTile label="Работаем с">{dateLabel(project.startDate)}</StatTile>
            <StatTile label="Главный KPI">{metric ? METRICS[metric].label : "не задан"}</StatTile>
            <StatTile label="Реклама">
              {project.sources.length ? project.sources.map((s) => PLATFORM_LABELS[s.platform]).join(", ") : "нет источников"}
            </StatTile>
            <StatTile label="KPI выполнен">{judged.length ? `${metCount} из ${judged.length} мес.` : "нет данных"}</StatTile>
            <StatTile label="Медиабайер">{buyer?.name ?? "не назначен"}</StatTile>
            <StatTile label="SMM">{project.owners.smm ?? "не назначен"}</StatTile>
          </div>
          {project.notes ? <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">{project.notes}</p> : null}
        </Card>

        <Card>
          <CardHead title="Результат: план / факт" hint={metric ? `${METRICS[metric].label} по месяцам, пунктир — план` : "Главный KPI по месяцам"} />
          {chart.some((m) => m.data?.kpi) ? (
            <PlanFactChart data={chart.map((m) => ({ month: m.month, fact: m.data?.kpi?.fact ?? 0, plan: m.data?.kpi?.plan ?? null, forecast: m.forecast }))} />
          ) : (
            <Empty>Нет плана или данных по главному KPI. Задайте план месяца во «Вводных».</Empty>
          )}
          <div className="mt-4 flex flex-wrap gap-1">
            <Link href={`/projects/${p.id}`} className="btn-ghost px-3 py-1.5">
              Результаты проекта →
            </Link>
            <Link href={`/ads?p=${p.id}`} className="btn-ghost px-3 py-1.5">
              История рекламы →
            </Link>
            <Link href={`/smm?p=${p.id}`} className="btn-ghost px-3 py-1.5">
              История SMM →
            </Link>
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="По месяцам: результаты и деньги" hint="Результаты клиента, наш доход по условиям, оплаты и затраты на команду" />
        <Table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th className="!text-right">План KPI</th>
              <th className="!text-right">Факт</th>
              <th>Выполнение</th>
              <th className="!text-right">Расход на рекламу</th>
              <th className="!text-right">Доход клиента</th>
              <th className="!text-right">Наш доход</th>
              <th className="!text-right">Получено</th>
              <th className="!text-right">Медиабайер</th>
              <th className="!text-right">Маржа</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const k = m.data?.kpi;
              const v = k?.[m.forecast ? "pace" : "progress"];
              const cost = costOf(m.month);
              return (
                <tr key={m.month}>
                  <td className="font-semibold">
                    {monthLabel(m.month)}
                    {m.forecast && <span className="ml-1 text-xs font-normal text-muted-foreground">идёт</span>}
                  </td>
                  <td className="text-right tabular-nums">{k?.plan != null ? formatNumber(k.plan) : "—"}</td>
                  <td className="text-right tabular-nums">{k ? formatNumber(k.fact) : "—"}</td>
                  <td>{v != null ? <Pill tone={pctTone(v * 100)}>{m.forecast ? "темп " : ""}{Math.round(v * 100)}%</Pill> : <Pill tone={KPI_TONE[m.kpi]}>{KPI_LABEL[m.kpi]}</Pill>}</td>
                  <td className="text-right tabular-nums">{m.data?.spend != null ? money(m.data.spend, cur ?? "USD") : "—"}</td>
                  <td className="text-right tabular-nums">{m.data?.revenue != null ? money(m.data.revenue, cur ?? "USD") : "—"}</td>
                  <td className="text-right tabular-nums">
                    {m.accrual ? (
                      <>
                        <b>{money(m.accrual.total, m.accrual.currency)}</b>
                        {m.accrual.share > 0 && <span className="block text-[11px] text-muted-foreground">фикс {money(m.accrual.fix, m.accrual.currency)} + {money(m.accrual.share, m.accrual.currency)}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {m.receivedBase ? <span className="text-positive">{money(m.receivedBase)}</span> : m.issuedBase ? <Pill tone="warning">выставлен</Pill> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-right tabular-nums">{cost ? money(cost) : "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{m.accrual ? money(m.accrualBase - cost) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          Результаты и расход — в валюте проекта, наш доход — в валюте договора, получено и маржа — в долларах (по курсу счёта или НБУ).
        </p>
      </Card>

      <Card>
        <CardHead title="Счета клиента">
          <Link href={`/finance/invoices/new?project=${p.id}`} className="btn-primary">
            + Новый инвойс
          </Link>
        </CardHead>
        {invoices.length ? (
          <Table>
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>За месяц</th>
                <th>Реквизиты</th>
                <th className="!text-right">Сумма</th>
                <th>Курс</th>
                <th className="!text-right">В $</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className={i.status === "cancelled" ? "opacity-50" : undefined}>
                  <td className="tabular-nums text-muted-foreground">{i.document ? i.number : "—"}</td>
                  <td className="tabular-nums">{dateLabel(i.issueDate)}</td>
                  <td className="text-muted-foreground">{monthLabel(i.month)}</td>
                  <td className="text-muted-foreground">{i.recipient?.label ?? "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{money(i.total, i.currency, 2)}</td>
                  <td className="text-xs text-muted-foreground tabular-nums">{i.contractCurrency && i.fxRate ? `1 ${i.contractCurrency} = ${i.fxRate} ${i.currency}` : "—"}</td>
                  <td className="text-right tabular-nums">
                    {money(i.contractCurrency && i.fxRate ? toBase(i.total / i.fxRate, i.contractCurrency, r.rates) : toBase(i.total, i.currency, r.rates))}
                  </td>
                  <td>
                    {i.status === "paid" ? <Pill tone="good">Оплачен {i.paidDate ? dateLabel(i.paidDate) : ""}</Pill> : i.status === "cancelled" ? <Pill>Отменён</Pill> : <Pill tone="warning">Выставлен</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>Счетов этому клиенту ещё не выставляли.</Empty>
        )}
      </Card>
    </div>
  );
}
