import type { Metadata } from "next";
import { PlanFactChart } from "@/components/finance/charts";
import { PlanForm } from "@/components/finance/expense-ui";
import { CardHead, monthLabel, monthShort, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { buildFinanceReport } from "@/lib/finance/report";

export const metadata: Metadata = { title: "Financial · План / Факт" };

const pctTone = (p: number) => (p >= 100 ? "good" : p >= 90 ? "warning" : "bad");

export default async function FinancePlanPage() {
  await requireSection("finance");
  const r = await buildFinanceReport();
  const rows = [...r.pnl].reverse();
  const clients = r.projects.filter((p) => p.status !== "archived");
  const last = r.months.slice(-6);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-5">
        <Card>
          <CardHead title="Доход: план / факт" hint="Пунктир — план, подпись — % выполнения. Текущий месяц — прогноз" />
          <PlanFactChart data={r.pnl.map((m) => ({ month: m.month, fact: m.revenue, plan: m.plan?.revenuePlan ?? null, forecast: m.forecast }))} />
        </Card>
        <Card>
          <CardHead title="Прибыль: план / факт" hint="Доход минус зарплаты и расходы" />
          <PlanFactChart data={r.pnl.map((m) => ({ month: m.month, fact: m.profit, plan: m.plan?.profitPlan ?? null, forecast: m.forecast }))} />
        </Card>
      </div>

      <Card>
        <CardHead title="История по месяцам" hint="План задаётся в долларах справа — доход и прибыль на месяц" />
        <Table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th className="!text-right">Доход</th>
              <th className="!text-right">Зарплаты</th>
              <th className="!text-right">Расходы</th>
              <th className="!text-right">Прибыль</th>
              <th className="!text-right">Получено</th>
              <th>Выполнение</th>
              <th className="!text-right">План: доход / прибыль</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const rp = m.plan?.revenuePlan ? Math.round((m.revenue / m.plan.revenuePlan) * 100) : null;
              const pp = m.plan?.profitPlan ? Math.round((m.profit / m.plan.profitPlan) * 100) : null;
              return (
                <tr key={m.month}>
                  <td className="font-semibold">
                    {monthLabel(m.month)}
                    {m.forecast && <span className="ml-1 text-xs font-normal text-muted-foreground">прогноз</span>}
                  </td>
                  <td className="text-right tabular-nums">{money(m.revenue)}</td>
                  <td className="text-right tabular-nums">{money(m.payroll)}</td>
                  <td className="text-right tabular-nums">{money(m.other)}</td>
                  <td className="text-right font-semibold tabular-nums">{money(m.profit)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{money(m.received)}</td>
                  <td>
                    <span className="flex gap-1">
                      {rp !== null && <Pill tone={pctTone(rp)}>доход {rp}%</Pill>}
                      {pp !== null && <Pill tone={pctTone(pp)}>прибыль {pp}%</Pill>}
                      {rp === null && pp === null && <span className="text-xs text-muted-foreground">план не задан</span>}
                    </span>
                  </td>
                  <td>
                    <PlanForm month={m.month} revenuePlan={m.plan?.revenuePlan ?? null} profitPlan={m.plan?.profitPlan ?? null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHead title="Выполнение плана клиентов" hint="Главный KPI каждого клиента из «Вводных», % от плана. От него зависят % клиентов и зарплата медиабайера" />
        <Table>
          <thead>
            <tr>
              <th>Клиент</th>
              {last.map((m) => (
                <th key={m} className="!text-center">
                  {monthShort(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                {last.map((m) => {
                  const row = p.months.find((x) => x.month === m);
                  const v = row?.data?.kpi?.[row.forecast ? "pace" : "progress"];
                  return (
                    <td key={m} className="text-center">
                      {v == null ? <span className="text-muted-foreground">—</span> : <Pill tone={pctTone(v * 100)}>{Math.round(v * 100)}%</Pill>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">Текущий месяц — темп: куда придёт результат к концу месяца.</p>
      </Card>
    </div>
  );
}
