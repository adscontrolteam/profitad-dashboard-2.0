import type { Metadata } from "next";
import Link from "next/link";
import { TermsButton } from "@/components/finance/terms-editor";
import { CardHead, monthShort, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { KPI_TONE, termsSummary } from "@/lib/finance/labels";
import { buildFinanceReport } from "@/lib/finance/report";
import { defaultBuyerRate } from "@/lib/finance/rules";

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
            <TermsButton primary label="Заполнить условия" target={{ id: p.id, name: p.name, startMonth: p.startMonth, sourcesCount: p.sourcesCount, currency: p.currency, terms: null }} />
          </span>
        </div>
      ))}

      <Card>
        <CardHead title="Договоры и условия оплаты" hint="Проекты приходят из «Вводных». Доход месяца считается по условиям и фактическим результатам клиента" />
        <Table>
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Условия</th>
              <th>С месяца</th>
              <th>Медиабайер</th>
              <th className="!text-right">Ставка</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((p) => {
              const rate = p.terms?.buyerRate ?? defaultBuyerRate(p.sourcesCount);
              const buyer = r.people.find((x) => x.email === p.mediaBuyerEmail);
              return (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name}</td>
                  <td>{termsSummary(p.terms) ?? <span className="text-muted-foreground">не заполнены</span>}</td>
                  <td className="text-muted-foreground">{p.terms ? monthShort(p.terms.startMonth) + " " + p.terms.startMonth.slice(0, 4) : "—"}</td>
                  <td>{buyer?.name ?? <span className="text-muted-foreground">не назначен</span>}</td>
                  <td className="text-right tabular-nums">
                    {rate === null ? <Pill tone="warning">задать ({p.sourcesCount} ист.)</Pill> : money(rate)}
                  </td>
                  <td className="text-right">
                    <TermsButton label="Изменить" target={{ id: p.id, name: p.name, startMonth: p.startMonth, sourcesCount: p.sourcesCount, currency: p.currency, terms: p.terms }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHead title="Доход по клиентам" hint="Начислено по условиям. Цвет — выполнение KPI клиента в этом месяце; последний месяц — прогноз" />
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
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                {last.map((m) => {
                  const row = p.months.find((x) => x.month === m);
                  return (
                    <td key={m} className="text-right tabular-nums">
                      {row?.accrual ? (
                        <div className="flex flex-col items-end gap-1">
                          <b>{money(row.accrual.total, row.accrual.currency)}</b>
                          <Pill tone={KPI_TONE[row.kpi]}>
                            {row.data?.kpi?.[row.forecast ? "pace" : "progress"] != null
                              ? `${Math.round(row.data!.kpi![row.forecast ? "pace" : "progress"]! * 100)}%`
                              : "—"}
                          </Pill>
                          {row.accrual.base !== null && row.accrual.share >= 0 && p.terms?.shareBase === "client_profit" && (
                            <span className="text-[11px] text-muted-foreground">X = {money(row.accrual.base, row.accrual.currency)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          X = доход клиента с рекламы − расход на рекламу − фикс. Доход и расход берутся из «Реальных результатов» проекта и рекламного кабинета.{" "}
          <Link href="/inputs" className="underline">Вводные</Link>
        </p>
      </Card>
    </div>
  );
}
