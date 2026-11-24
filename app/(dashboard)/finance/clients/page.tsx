import type { Metadata } from "next";
import { ClickRow } from "@/components/finance/click-row";
import { TermsButton } from "@/components/finance/terms-editor";
import { CardHead, monthShort, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { KPI_LABEL, KPI_TONE, termsSummary, payStatus } from "@/lib/finance/labels";
import { buildFinanceReport } from "@/lib/finance/report";
import { PaymentsSection } from "./payments";

export const metadata: Metadata = { title: "Financial · Клиенты и оплаты" };

export default async function FinanceClientsPage() {
  await requireSection("finance");
  const r = await buildFinanceReport();
  const clients = r.projects.filter((p) => p.status !== "archived");
  const missing = clients.filter((p) => !p.terms);

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
        <CardHead title="Договоры и условия оплаты" hint="Нажмите на клиента, чтобы открыть всё по нему: результаты, деньги по месяцам, счета. Счета и оплаты всех клиентов — ниже" />
        <Table>
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Условия</th>
              <th>С месяца</th>
              <th>KPI в этом месяце</th>
              <th className="!text-right">Доход месяца</th>
              <th>Оплата</th>
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

      <PaymentsSection />
    </div>
  );
}
