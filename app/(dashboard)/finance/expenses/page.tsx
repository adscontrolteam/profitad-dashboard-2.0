import type { Metadata } from "next";
import { ExpenseButton } from "@/components/finance/expense-ui";
import { CardHead, Empty, KpiTile, monthLabel, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { buildFinanceReport, expenseActive } from "@/lib/finance/report";

export const metadata: Metadata = { title: "Financial · Расходы" };

export default async function FinanceExpensesPage() {
  await requireSection("finance");
  const r = await buildFinanceReport();
  const cur = r.pnl[r.pnl.length - 1];
  const lines = r.expensesFor(r.now);
  const recurring = lines.filter((l) => l.expense.recurring).reduce((a, l) => a + l.amountBase, 0);
  const total = cur.payroll + cur.other;
  const inactive = r.expenses.filter((e) => !expenseActive(e, r.now));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
        <KpiTile label={`Расходы · ${monthLabel(r.now)}`} value={money(total)}>
          <span>{cur.revenue ? `${Math.round((total / cur.revenue) * 100)}% от дохода` : "дохода пока нет"}</span>
        </KpiTile>
        <KpiTile label="Зарплаты (авто)" value={money(cur.payroll)}>
          <span>из вкладки «Зарплаты», прогноз</span>
        </KpiTile>
        <KpiTile label="Регулярные" value={money(recurring)}>
          <span>повторяются каждый месяц</span>
        </KpiTile>
        <KpiTile label="Разовые" value={money(cur.other - recurring)}>
          <span>только в этом месяце</span>
        </KpiTile>
      </div>

      <Card>
        <CardHead title={`Расходы за ${monthLabel(r.now)}`} hint="Суммы в долларах по курсу НБУ">
          <ExpenseButton expense={null} label="+ Расход" month={r.now} />
        </CardHead>
        <Table>
          <thead>
            <tr>
              <th>Статья</th>
              <th>Категория</th>
              <th>Тип</th>
              <th className="!text-right">Сумма</th>
              <th className="!text-right">В $</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-semibold">
                Зарплаты команды
                <span className="block text-xs font-normal text-muted-foreground">считаются автоматически</span>
              </td>
              <td className="text-muted-foreground">Зарплаты</td>
              <td>
                <Pill>авто</Pill>
              </td>
              <td className="text-right tabular-nums">{money(cur.payroll)}</td>
              <td className="text-right font-semibold tabular-nums">{money(cur.payroll)}</td>
              <td></td>
            </tr>
            {lines.map(({ expense: e, amountBase }) => (
              <tr key={e.id}>
                <td className="font-semibold">{e.name}</td>
                <td className="text-muted-foreground">{e.category}</td>
                <td>
                  <Pill tone={e.recurring ? "info" : "warning"}>{e.recurring ? "ежемесячно" : "разово"}</Pill>
                </td>
                <td className="text-right tabular-nums">{money(e.amount, e.currency)}</td>
                <td className="text-right font-semibold tabular-nums">{money(amountBase)}</td>
                <td className="text-right">
                  <ExpenseButton expense={e} label="Изменить" month={r.now} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="font-bold">Итого</td>
              <td colSpan={3}></td>
              <td className="text-right font-bold tabular-nums">{money(total)}</td>
              <td></td>
            </tr>
          </tbody>
        </Table>
        {!lines.length && <div className="mt-3"><Empty>Добавьте сервисы, офис, налоги и другие расходы — они попадут в прибыль на главной.</Empty></div>}
      </Card>

      {inactive.length > 0 && (
        <Card>
          <CardHead title="Другие месяцы" hint="Разовые расходы прошлых месяцев и завершённые регулярные" />
          <Table>
            <tbody>
              {inactive.map((e) => (
                <tr key={e.id}>
                  <td className="font-semibold">{e.name}</td>
                  <td className="text-muted-foreground">{e.category}</td>
                  <td className="text-muted-foreground">
                    {monthLabel(e.startMonth)}
                    {e.recurring && e.endMonth ? ` — ${monthLabel(e.endMonth)}` : ""}
                  </td>
                  <td className="text-right tabular-nums">{money(e.amount, e.currency)}</td>
                  <td className="text-right">
                    <ExpenseButton expense={e} label="Изменить" month={r.now} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
