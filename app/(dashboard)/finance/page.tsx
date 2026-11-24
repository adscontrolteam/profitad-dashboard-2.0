import type { Metadata } from "next";
import { InfoHint } from "@/components/ui/info-hint";
import Link from "next/link";
import { PnlChart } from "@/components/finance/charts";
import { CardHead, Empty, KpiTile, monthLabel, Note, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { KPI_LABEL, KPI_TONE, payStatus, termsSummary } from "@/lib/finance/labels";
import { buildFinanceReport } from "@/lib/finance/report";

export const metadata: Metadata = { title: "Financial" };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const delta = (a: number, b: number | undefined) => {
  if (!b) return null;
  const v = Math.round((a / b - 1) * 100);
  return `${v >= 0 ? "+" : "−"}${Math.abs(v)}% к прошлому месяцу`;
};

export default async function FinanceOverviewPage() {
  await requireSection("finance");
  const r = await buildFinanceReport();
  const cur = r.pnl[r.pnl.length - 1];
  const prev = r.pnl.length > 1 ? r.pnl[r.pnl.length - 2] : undefined;
  const expenses = cur.payroll + cur.other;
  const unpaid = r.payoutsDue.filter((p) => !p.paid);
  const unpaidTotal = unpaid.reduce((a, p) => a + p.amount, 0);

  const structure = [
    ...r.people
      .map((p) => ({ label: `Зарплата · ${p.name}`, value: p.lines.filter((l) => l.month === r.now).reduce((a, l) => a + l.amountBase, 0) + (p.baseSalary || 0) }))
      .filter((x) => x.value > 0),
    ...Object.entries(
      r.expensesFor(r.now).reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.expense.category]: (acc[e.expense.category] ?? 0) + e.amountBase }), {}),
    ).map(([label, value]) => ({ label, value })),
  ].sort((a, b) => b.value - a.value);
  const maxStruct = Math.max(1, ...structure.map((s) => s.value));

  const clients = r.projects.filter((p) => p.status !== "archived");

  return (
    <div className="flex flex-col gap-5">
      {unpaid.length > 0 && (
        <Link
          href="/finance/payroll"
          className="flex flex-wrap items-center gap-3 rounded-[20px] border border-dashed border-muted-foreground/60 bg-card px-5 py-4 transition-colors hover:bg-muted"
        >
          <Pill tone="lime">К выплате</Pill>
          <span className="text-sm">
            Зарплаты за {monthLabel(unpaid[0].month)}: <b className="tabular-nums">{money(unpaidTotal)}</b> —{" "}
            {unpaid.map((p) => `${p.name} ${money(p.amount)}`).join(", ")}
          </span>
          <span className="ml-auto text-sm font-semibold">Открыть →</span>
        </Link>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:gap-5 xl:grid-cols-4">
        <KpiTile label={`Доход · ${monthLabel(r.now)}`} value={money(cur.revenue)}>
          {cur.plan?.revenuePlan ? <Pill tone={cur.revenue >= cur.plan.revenuePlan ? "good" : "warning"}>{pct(cur.revenue, cur.plan.revenuePlan)} плана</Pill> : null}
          <span>деньги, которые зашли в этом месяце</span>
          <span className="w-full">
            по условиям клиентов {money(cur.expected)}
            {delta(cur.revenue, prev?.revenue) ? ` · ${delta(cur.revenue, prev?.revenue)}` : ""}
          </span>
        </KpiTile>
        <KpiTile label={`Расходы · ${monthLabel(r.now)}`} value={money(expenses)}>
          <Pill>{pct(expenses, cur.revenue)} от дохода</Pill>
          <span>зарплаты {money(cur.payroll)}</span>
          <span className="w-full">
            прочее {money(cur.other)}
            {delta(expenses, prev ? prev.payroll + prev.other : undefined) ? ` · ${delta(expenses, prev ? prev.payroll + prev.other : undefined)}` : ""}
          </span>
        </KpiTile>
        <KpiTile label={`Прибыль · ${monthLabel(r.now)}`} value={money(cur.profit)}>
          <Pill tone="lime">маржа {pct(cur.profit, cur.revenue)}</Pill>
          {cur.plan?.profitPlan ? <span>план {money(cur.plan.profitPlan)} · {pct(cur.profit, cur.plan.profitPlan)}</span> : <span>план не задан</span>}
          {delta(cur.profit, prev?.profit) ? <span className="w-full">{delta(cur.profit, prev?.profit)}</span> : null}
        </KpiTile>
        <KpiTile label="ЗП фонд" value={money(r.payrollFund.total)} highlight>
          <span>столько должно лежать на зарплаты</span>
          <span className="w-full">
            {r.payrollFund.unpaid > 0 ? `не выплачено ${money(r.payrollFund.unpaid)} · ` : ""}
            {monthLabel(r.now)} {money(r.payrollFund.current)}
          </span>
          <span className="w-full">
            {monthLabel(r.payrollFund.nextMonth)}{" "}
            {r.payrollFund.next > 0 ? `${money(r.payrollFund.next)} · оплатили: ${r.payrollFund.nextProjects.join(", ")}` : "— ещё никто не оплатил"}
          </span>
        </KpiTile>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-5">
        <Card>
          <CardHead title="Доход, расходы и прибыль" hint="Доход — деньги по месяцу оплаты. Текущий месяц: зарплаты по полной ставке" />
          <PnlChart data={r.pnl} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-foreground" />Доход</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-muted-foreground/40" />Расходы</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-positive" />Прибыль</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-cta" />Прогноз месяца</span>
          </div>
        </Card>
        <Card>
          <CardHead title="Структура расходов" hint={monthLabel(r.now)} />
          {structure.length ? (
            <div className="flex flex-col">
              {structure.map((s, i) => (
                <div key={s.label} className={i ? "border-t border-border py-2.5" : "pb-2.5"}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <b className="tabular-nums">{money(s.value)}</b>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(s.value, expenses)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-track">
                    <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(s.value / maxStruct) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Расходов пока нет — добавьте их во вкладке «Расходы».</Empty>
          )}
          {cur.revenue > 0 && <Note>Зарплаты — <b>{pct(cur.payroll, cur.revenue)} дохода</b>. Ориентир для агентства — до 50%.</Note>}
        </Card>
      </div>

      <Card>
        <CardHead title="Клиенты в этом месяце" hint="Доход — деньги клиента, которые зашли в этом месяце. Оплата — за какой месяц он уже заплатил">
          <Link href="/finance/clients" className="btn-ghost">Условия →</Link>
        </CardHead>
        <Table>
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Условия</th>
              <th>KPI клиента</th>
              <th className="!text-right">Доход месяца</th>
              <th>Оплата</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((p) => {
              const m = p.months[p.months.length - 1];
              const k = m?.data?.kpi;
              return (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name}</td>
                  <td className="text-muted-foreground">{termsSummary(p.terms) ?? <Pill tone="lime">Заполнить условия</Pill>}</td>
                  <td>
                    <Pill tone={KPI_TONE[m?.kpi ?? "unknown"]}>
                      {k?.pace != null ? `темп ${Math.round(k.pace * 100)}%` : KPI_LABEL[m?.kpi ?? "unknown"]}
                    </Pill>
                  </td>
                  <td className="text-right tabular-nums">
                    <b>{m?.receivedBase ? money(m.receivedBase) : "—"}</b>
                    {m?.accrual ? <span className="block text-xs text-muted-foreground">по условиям {money(m.accrual.total, m.accrual.currency)}</span> : null}
                  </td>
                  <td>
                    {(() => {
                      const st = payStatus(p.pay, r.now, r.invoices.some((x) => x.projectId === p.id && x.status === "issued"));
                      return (
                        <>
                          <Pill tone={st.tone}>{st.label}</Pill>
                          {st.hint && <span className="block text-xs text-negative">{st.hint}</span>}
                        </>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <InfoHint caption="Курс пересчёта" className="mt-3">Суммы в долларах по курсу НБУ: 1 USD = {r.rates.USD?.toFixed(2)} ₴, 1 EUR = {r.rates.EUR?.toFixed(2)} ₴.</InfoHint>
      </Card>
    </div>
  );
}
