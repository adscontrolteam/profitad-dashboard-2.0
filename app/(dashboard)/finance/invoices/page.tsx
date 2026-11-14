import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceRowActions, RecordPaymentButton } from "@/components/finance/invoice-actions";
import { MethodsList } from "@/components/finance/methods-card";
import { CardHead, dateLabel, Empty, KpiTile, monthLabel, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { getProjects } from "@/lib/data";
import { getRates, money, toBase } from "@/lib/finance/fx";
import { listInvoices, listMethods } from "@/lib/finance/store";
import { currentMonth } from "@/lib/projects/plans";

export const metadata: Metadata = { title: "Financial · Инвойсы" };

export default async function FinanceInvoicesPage() {
  await requireSection("finance");
  const [invoices, methods, projects, rates] = await Promise.all([listInvoices(), listMethods(), getProjects(), getRates()]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const now = currentMonth();
  const active = invoices.filter((i) => i.status !== "cancelled");
  const sum = (list: typeof invoices) => list.reduce((a, i) => a + toBase(i.total, i.currency, rates), 0);
  const issued = active.filter((i) => i.status === "issued");
  const paidThisMonth = active.filter((i) => i.status === "paid" && i.paidDate?.startsWith(now));
  const now0 = new Date();
  const today = now0.toISOString().slice(0, 10);
  const weekAgo = new Date(now0.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const old = issued.filter((i) => i.issueDate < weekAgo);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
        <KpiTile label="Получено в этом месяце" value={money(sum(paidThisMonth))}>
          <span>{paidThisMonth.length} оплат</span>
        </KpiTile>
        <KpiTile label="Ожидаем оплату" value={money(sum(issued))}>
          <span>{issued.length} счетов</span>
        </KpiTile>
        <KpiTile label="Без оплаты > 7 дней" value={money(sum(old))} tone={old.length ? "negative" : undefined}>
          <span>{old.length ? old.map((i) => names.get(i.projectId ?? "") ?? "—").join(", ") : "всё в порядке"}</span>
        </KpiTile>
        <KpiTile label="Всего счетов" value={String(invoices.filter((i) => i.document).length)}>
          <span>следующий № {Math.max(0, ...invoices.map((i) => i.number)) + 1}</span>
        </KpiTile>
      </div>

      <Card>
        <CardHead title="Счета и оплаты" hint="Суммы в валюте счёта; в шапке — в долларах по курсу НБУ">
          <RecordPaymentButton projects={projects.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name }))} methods={methods} month={now} />
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
                  <td className="text-muted-foreground">{monthLabel(i.month)}</td>
                  <td className="text-muted-foreground">{i.recipient?.label ?? "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{money(i.total, i.currency, 2)}</td>
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
        <CardHead title="Реквизиты" hint="Выбираются в конструкторе счёта. Изменения не трогают уже выставленные счета" />
        <MethodsList methods={methods} />
      </Card>
    </div>
  );
}
