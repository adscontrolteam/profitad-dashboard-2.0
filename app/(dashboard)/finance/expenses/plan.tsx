import { PlanFactChart } from "@/components/finance/charts";
import { PlanForm } from "@/components/finance/expense-ui";
import { CardHead, monthLabel, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/finance/fx";
import type { FinanceReport } from "@/lib/finance/report";
import { addMonths } from "@/lib/projects/plans";


const pctTone = (p: number) => (p >= 100 ? "good" : p >= 90 ? "warning" : "bad");

/** Plan against fact by months: the agency's income and profit. A part of «Расходы и план». */
export function PlanSection({ r }: { r: FinanceReport }) {
  const rows = [...r.pnl].reverse();
  // Plans can be set three months ahead; the charts stop at the current month.
  const ahead = [3, 2, 1].map((n) => addMonths(r.now, n));

  return (
    <div id="plan" className="flex scroll-mt-24 flex-col gap-5">
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-5">
        <Card>
          <CardHead title="Доход: факт / план" hint="Пунктир — план, подпись — % выполнения. Текущий месяц — прогноз" />
          <PlanFactChart data={r.pnl.map((m) => ({ month: m.month, fact: m.revenue, plan: m.plan?.revenuePlan ?? null, forecast: m.forecast }))} />
        </Card>
        <Card>
          <CardHead title="Прибыль: факт / план" hint="Доход минус зарплаты и расходы" />
          <PlanFactChart data={r.pnl.map((m) => ({ month: m.month, fact: m.profit, plan: m.plan?.profitPlan ?? null, forecast: m.forecast }))} />
        </Card>
      </div>

      <Card>
        <CardHead title="История по месяцам" hint="План задаётся в долларах справа: доход и прибыль. Можно на три месяца вперёд" />
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
            {ahead.map((month) => {
              const plan = r.plans.find((p) => p.month === month);
              return (
                <tr key={month}>
                  <td className="font-semibold">
                    {monthLabel(month)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">план</span>
                  </td>
                  <td colSpan={5} className="text-muted-foreground">
                    {plan?.revenuePlan || plan?.profitPlan
                      ? `доход ${money(plan.revenuePlan)} · прибыль ${money(plan.profitPlan)}`
                      : "месяц ещё не начался — задайте план справа"}
                  </td>
                  <td></td>
                  <td>
                    <PlanForm month={month} revenuePlan={plan?.revenuePlan ?? null} profitPlan={plan?.profitPlan ?? null} />
                  </td>
                </tr>
              );
            })}
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

    </div>
  );
}
