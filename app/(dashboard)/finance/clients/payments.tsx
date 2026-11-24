import Link from "next/link";
import { InvoiceRowActions, MonthButton, RecordPaymentButton } from "@/components/finance/invoice-actions";
import { MethodsList } from "@/components/finance/methods-card";
import { CardHead, dateLabel, Empty, KpiTile, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { getProjects } from "@/lib/data";
import { BASE_CURRENCY, convert, getRates, money } from "@/lib/finance/fx";
import { buildFinanceReport } from "@/lib/finance/report";
import { invoiceIn, listMethods, listTerms } from "@/lib/finance/store";
import { currentMonth } from "@/lib/projects/plans";

/** Invoices and payments of every client, with the payment accounts folded away. A part of «Клиенты и оплаты». */
export async function PaymentsSection() {
  const [report, methods, projects, rates, terms] = await Promise.all([buildFinanceReport(), listMethods(), getProjects(), getRates(), listTerms()]);
  const invoices = report.invoices;
  const termCurrency = new Map(terms.map((t) => [t.projectId, t.currency]));
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const now = currentMonth();
  const active = invoices.filter((i) => i.status !== "cancelled");
  const sum = (list: typeof invoices) => list.reduce((a, i) => a + invoiceIn(i, BASE_CURRENCY, (x, f, t) => convert(x, f, t, rates)), 0);
  const issued = active.filter((i) => i.status === "issued");
  const paidThisMonth = active.filter((i) => i.status === "paid" && i.paidDate?.startsWith(now));
  const now0 = new Date();
  const today = now0.toISOString().slice(0, 10);
  const weekAgo = new Date(now0.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const old = issued.filter((i) => i.issueDate < weekAgo);

  return (
    <div id="payments" className="flex scroll-mt-24 flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
        <KpiTile label="Получено в этом месяце" value={money(sum(paidThisMonth))}>
          <span>оплат: {paidThisMonth.length}</span>
        </KpiTile>
        <KpiTile label="Ожидаем оплату" value={money(sum(issued))}>
          <span>счетов: {issued.length}</span>
        </KpiTile>
        <KpiTile label="Без оплаты > 7 дней" value={money(sum(old))} tone={old.length ? "negative" : undefined}>
          <span>{old.length ? old.map((i) => names.get(i.projectId ?? "") ?? "—").join(", ") : "всё в порядке"}</span>
        </KpiTile>
        <KpiTile label="Всего счетов" value={String(invoices.filter((i) => i.document).length)}>
          <span>следующий № {Math.max(0, ...invoices.map((i) => i.number)) + 1}</span>
        </KpiTile>
      </div>

      <Card>
        <CardHead
          title="Счета и оплаты"
          hint="«За месяц» ставится сам: оплата до 7-го числа — за этот месяц, позже — за следующий. Часть суммы, оплаченная за текущий месяц, — тест на полмесяца. Нажмите на месяц, чтобы поправить"
        >
          <RecordPaymentButton projects={projects.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name, currency: termCurrency.get(p.id) ?? null }))} methods={methods} />
          <Link href="/finance/invoices/new" className="btn-primary">
            + Новый инвойс
          </Link>
        </CardHead>
        {invoices.length ? (
          <Table>
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Проект</th>
                <th>За месяц</th>
                <th>Реквизиты</th>
                <th className="!text-right">Сумма</th>
                <th>Курс</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className={i.status === "cancelled" ? "opacity-50" : undefined}>
                  <td className="tabular-nums text-muted-foreground">{i.document ? i.number : "—"}</td>
                  <td className="tabular-nums">{dateLabel(i.issueDate)}</td>
                  <td className="font-semibold">{names.get(i.projectId ?? "") ?? "—"}</td>
                  <td>
                    <MonthButton id={i.id} month={i.month} />
                  </td>
                  <td className="text-muted-foreground">{i.recipient?.label ?? "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{money(i.total, i.currency, 2)}</td>
                  <td className="text-xs text-muted-foreground tabular-nums">
                    {i.contractCurrency && i.fxRate ? (
                      <>
                        1 {i.contractCurrency} = {i.fxRate} {i.currency}
                        <span className="block">= {money(i.total / i.fxRate, i.contractCurrency, 2)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {i.status === "paid" ? (
                      <Pill tone="good">Оплачен {i.paidDate ? dateLabel(i.paidDate) : ""}</Pill>
                    ) : i.status === "cancelled" ? (
                      <Pill>Отменён</Pill>
                    ) : (
                      <Pill tone={i.issueDate < today ? "warning" : "info"}>Выставлен</Pill>
                    )}
                    {!i.document && <span className="ml-1 text-xs text-muted-foreground">без счёта</span>}
                  </td>
                  <td>
                    <InvoiceRowActions id={i.id} status={i.status} document={i.document} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>Счетов пока нет. Создайте первый — «Новый инвойс».</Empty>
        )}
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer select-none font-semibold">Реквизиты для счетов</summary>
          <p className="mb-3 mt-2 text-sm text-muted-foreground">Выбираются в конструкторе счёта. Изменения не трогают уже выставленные счета.</p>
          <MethodsList methods={methods} />
        </details>
      </Card>
    </div>
  );
}
