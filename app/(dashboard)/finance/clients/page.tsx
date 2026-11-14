import type { Metadata } from "next";
import { ClickRow } from "@/components/finance/click-row";
import { TermsButton } from "@/components/finance/terms-editor";
import { CardHead, monthShort, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { KPI_LABEL, KPI_TONE, termsSummary } from "@/lib/finance/labels";
import { buildFinanceReport } from "@/lib/finance/report";

export const metadata: Metadata = { title: "Financial · Клиенты" };

export default async function FinanceClientsPage() {
  await requireSection("finance");
  const r = await buildFinanceReport();
  const clients = r.projects.filter((p) => p.status !== "archived");
  const missing = clients.filter((p) => !p.terms);
  const last = r.months.slice(-6);

  return (
    <div className="flex flex-col gap-5">
      {missing.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[20px] border border-dashed border-muted-foreground/60 bg-card px-5 py-4">
          <Pill tone="lime">Новый из Вводных</Pill>
          <span className="text-sm">
            <b>{p.name}</b> — условия оплаты не заполнены, проект не участвует в доходе и прогнозе.
          </span>
          <span className="ml-auto">
            <TermsButton primary label="Заполнить условия" target={{ id: p.id, name: p.name, startMonth: p.startMonth, currency: p.currency, terms: null }} />
          </span>
        </div>
      ))}

      <Card>
        <CardHead title="Договоры и условия оплаты" hint="Нажмите на клиента, чтобы открыть всю аналитику по нему: результаты, деньги, цели, счета" />
        <Table>
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Условия</th>
              <th>С месяца</th>
              <th>KPI в этом месяце</th>
              <th className="!text-right">Доход месяца</th>
              <th className="!text-right">Получено</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((p) => {
              const m = p.months[p.months.length - 1];
              const pace = m?.data?.kpi?.pace;
              return (
                <ClickRow key={p.id} href={`/finance/clients/${p.id}`}>
                  <td className="font-semibold">{p.name}</td>
                  <td>{termsSummary(p.terms) ?? <span className="text-muted-foreground">не заполнены</span>}</td>
                  <td className="text-muted-foreground">{p.terms ? `${monthShort(p.terms.startMonth)} ${p.terms.startMonth.slice(0, 4)}` : "—"}</td>
                  <td>
                    <Pill tone={KPI_TONE[m?.kpi ?? "unknown"]}>{pace != null ? `темп ${Math.round(pace * 100)}%` : KPI_LABEL[m?.kpi ?? "unknown"]}</Pill>
                  </td>
                  <td className="text-right font-semibold tabular-nums">{m?.accrual ? money(m.accrual.total, m.accrual.currency) : "—"}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{m?.receivedBase ? money(m.receivedBase) : "—"}</td>
                  <td className="text-right">
                    <TermsButton label="Изменить" target={{ id: p.id, name: p.name, startMonth: p.startMonth, currency: p.currency, terms: p.terms }} />
                    <span className="ml-1 text-muted-foreground" aria-hidden>
                      →
                    </span>
                  </td>
                </ClickRow>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHead title="Доход по клиентам" hint="Начислено по условиям. Цвет — выполнение KPI клиента; в текущем месяце % считается по факту на сегодня" />
        <Table>
          <thead>
            <tr>
              <th>Клиент</th>
              {last.map((m) => (
                <th key={m} className="!text-right">
                  {monthShort(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((p) => (
              <ClickRow key={p.id} href={`/finance/clients/${p.id}`}>
                <td className="font-semibold">{p.name}</td>
                {last.map((m) => {
                  const row = p.months.find((x) => x.month === m);
                  const v = row?.data?.kpi?.[row.forecast ? "pace" : "progress"];
                  return (
                    <td key={m} className="text-right tabular-nums">
                      {row?.accrual ? (
                        <div className="flex flex-col items-end gap-1">
                          <b>{money(row.accrual.total, row.accrual.currency)}</b>
                          <Pill tone={KPI_TONE[row.kpi]}>{v != null ? `${Math.round(v * 100)}%` : "—"}</Pill>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </ClickRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
