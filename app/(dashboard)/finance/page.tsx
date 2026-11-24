import type { Metadata } from "next";
import Link from "next/link";
import { PnlChart } from "@/components/finance/charts";
import { CardHead, KpiTile, monthLabel, Pill } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { monthWord } from "@/lib/finance/labels";
import { buildFinanceReport } from "@/lib/finance/report";

export const metadata: Metadata = { title: "Financial" };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const delta = (a: number, b: number | undefined) => {
  if (!b) return null;
  const v = Math.round((a / b - 1) * 100);
  return `${v >= 0 ? "+" : "−"}${Math.abs(v)}% к прошлому месяцу`;
};

interface Todo {
  tone: "bad" | "warning" | "lime" | "info";
  tag: string;
  text: string;
  href: string;
}

/** One screen: the money right now and what has to be done about it. The details live on the other tabs. */
export default async function FinanceOverviewPage() {
  await requireSection("finance");
  const r = await buildFinanceReport();
  const cur = r.pnl[r.pnl.length - 1];
  const prev = r.pnl.length > 1 ? r.pnl[r.pnl.length - 2] : undefined;
  const fund = r.payrollFund;
  // What is left of the month's money once the payroll fund is set aside and the other expenses are paid.
  const free = cur.revenue - fund.total - cur.other;
  const clients = r.projects.filter((p) => p.status === "active");

  // Charts: the last half-year of money, this month's income by client, and where this month's income goes.
  const recent = r.pnl.slice(-6);
  const byClient = r.projects
    .map((p) => ({ label: p.name, value: p.months[p.months.length - 1]?.receivedBase ?? 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const maxClient = Math.max(1, ...byClient.map((x) => x.value));
  const split = [
    { label: `Зарплаты · ${monthLabel(r.now)}`, value: fund.current, tone: "bg-foreground/70" },
    { label: `Зарплаты · ${monthLabel(fund.nextMonth)}, уже оплачено клиентами`, value: fund.next, tone: "bg-foreground/40" },
    ...(fund.unpaid > 0 ? [{ label: "Не выплачено за прошлый месяц", value: fund.unpaid, tone: "bg-negative" }] : []),
    { label: "Расходы", value: cur.other, tone: "bg-muted-foreground/50" },
    { label: "Свободные деньги", value: Math.max(0, free), tone: "bg-positive" },
  ];

  const todo: Todo[] = [];
  const unpaid = r.payoutsDue.filter((p) => !p.paid);
  if (unpaid.length) {
    todo.push({
      tone: "lime",
      tag: "Выплатить",
      text: `Зарплаты за ${monthWord(unpaid[0].month)}: ${unpaid.map((p) => `${p.name} ${money(p.amount)}`).join(", ")}`,
      href: "/finance/payroll",
    });
  }
  for (const p of clients) {
    if (!p.terms) todo.push({ tone: "warning", tag: "Условия", text: `${p.name}: условия оплаты не заполнены — проект не участвует в расчётах`, href: "/finance/clients" });
    else if (p.pay && p.pay.debt >= 1) {
      todo.push({ tone: "bad", tag: "Не оплачено", text: `${p.name}: нет оплаты за ${monthWord(r.now)} — ${money(p.pay.debt, p.pay.currency)}`, href: `/finance/clients/${p.id}` });
    }
  }
  const open = r.invoices.filter((x) => x.status === "issued");
  if (open.length) {
    const names = open.map((x) => r.projects.find((p) => p.id === x.projectId)?.name ?? "—");
    todo.push({ tone: "warning", tag: "Ждём оплату", text: `Выставлено счетов: ${open.length} — ${[...new Set(names)].join(", ")}`, href: "/finance/clients#payments" });
  }
  // The next month is not paid for yet: these clients are due an invoice (issued by itself from the 25th).
  const notAhead = clients.filter((p) => p.terms && p.paidFor(fund.nextMonth) === "none" && !open.some((x) => x.projectId === p.id && x.month === fund.nextMonth));
  if (notAhead.length && Number(r.today.slice(8, 10)) >= 20) {
    todo.push({ tone: "info", tag: monthLabel(fund.nextMonth), text: `Ещё не оплатили и без счёта: ${notAhead.map((p) => p.name).join(", ")}`, href: "/finance/clients" });
  }
  const noRate = r.people.flatMap((p) => p.lines.filter((l) => l.month === r.now && l.amount === null).map((l) => `${p.name} · ${l.projectName}`));
  if (noRate.length) todo.push({ tone: "warning", tag: "Ставка", text: `Не задана ставка: ${noRate.join(", ")}`, href: "/finance/payroll" });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-2 lg:gap-5 xl:grid-cols-4">
        <KpiTile label={`Доход · ${monthLabel(r.now)}`} value={money(cur.revenue)}>
          {cur.plan?.revenuePlan ? <Pill tone={cur.revenue >= cur.plan.revenuePlan ? "good" : "warning"}>{pct(cur.revenue, cur.plan.revenuePlan)} плана</Pill> : null}
          <span>деньги, которые зашли в этом месяце</span>
          {delta(cur.revenue, prev?.revenue) ? <span className="w-full">{delta(cur.revenue, prev?.revenue)}</span> : null}
        </KpiTile>
        <KpiTile label="ЗП фонд" value={money(fund.total)}>
          <span>отложить на зарплаты</span>
          <span className="w-full">
            {fund.unpaid > 0 ? `не выплачено ${money(fund.unpaid)} · ` : ""}
            {monthLabel(r.now)} {money(fund.current)} · {monthLabel(fund.nextMonth)} {money(fund.next)}
          </span>
        </KpiTile>
        <KpiTile label={`Расходы · ${monthLabel(r.now)}`} value={money(cur.other)}>
          <span>всё, кроме зарплат</span>
          <span className="w-full">
            <Link href="/finance/expenses" className="underline-offset-2 hover:underline">
              {cur.other ? "открыть расходы" : "расходы не внесены"}
            </Link>
          </span>
        </KpiTile>
        <KpiTile label="Свободные деньги" value={money(free)} highlight tone={free < 0 ? "negative" : undefined}>
          <span>доход − ЗП фонд − расходы</span>
          {cur.revenue > 0 ? <span className="w-full">{pct(free, cur.revenue)} от дохода месяца</span> : null}
        </KpiTile>
      </div>

      <Card>
        <CardHead title="Что сделать" hint="Только то, что ждёт вашего действия. Пусто — значит, всё в порядке" />
        {todo.length ? (
          <div className="flex flex-col">
            {todo.map((t, i) => (
              <Link
                key={`${t.tag}-${i}`}
                href={t.href}
                className={`flex flex-wrap items-center gap-3 px-1 py-3 text-sm transition-colors hover:bg-muted ${i ? "border-t border-border" : ""}`}
              >
                <Pill tone={t.tone}>{t.tag}</Pill>
                <span className="min-w-0 flex-1">{t.text}</span>
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Всё оплачено и выплачено, действий не требуется.</p>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-3 lg:gap-5">
        <Card>
          <CardHead title="Доход, расходы и прибыль" hint="Последние полгода. Доход — деньги по месяцу оплаты" />
          <PnlChart data={recent} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-foreground" />
              Доход
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-muted-foreground/40" />
              Расходы
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-full bg-positive" />
              Прибыль
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-[3px] bg-cta" />
              Текущий месяц
            </span>
          </div>
        </Card>

        <Card>
          <CardHead title="Доход по клиентам" hint={`Кто сколько заплатил в ${monthLabel(r.now)}`} />
          {byClient.length ? (
            <div className="flex flex-col">
              {byClient.map((c, i) => (
                <div key={c.label} className={i ? "border-t border-border py-2" : "pb-2"}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    <b className="tabular-nums">{money(c.value)}</b>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(c.value, cur.revenue)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-track">
                    <div className="h-full rounded-full bg-cta" style={{ width: `${(c.value / maxClient) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">В этом месяце оплат ещё не было.</p>
          )}
        </Card>

        <Card>
          <CardHead title="Куда идёт доход месяца" hint="Сколько отложить на зарплаты, сколько уходит на расходы и что остаётся" />
          {cur.revenue > 0 ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-track">
                {split
                  .filter((x) => x.value > 0)
                  .map((x) => (
                    <div key={x.label} className={x.tone} style={{ width: `${(x.value / Math.max(cur.revenue, fund.total + cur.other)) * 100}%` }} title={`${x.label}: ${money(x.value)}`} />
                  ))}
              </div>
              <div className="mt-3 flex flex-col">
                {split.map((x, i) => (
                  <div key={x.label} className={`flex items-center gap-2 text-sm ${i ? "border-t border-border py-2" : "pb-2"}`}>
                    <i className={`size-2.5 shrink-0 rounded-[3px] ${x.tone}`} />
                    <span className="min-w-0 flex-1">{x.label}</span>
                    <b className="tabular-nums">{money(x.value)}</b>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(x.value, cur.revenue)}</span>
                  </div>
                ))}
              </div>
              {free < 0 && <p className="mt-2 text-xs text-negative">Дохода месяца не хватает на ЗП фонд и расходы: не хватает {money(-free)}.</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Дохода в этом месяце пока нет.</p>
          )}
        </Card>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Суммы в долларах по курсу НБУ: 1 USD = {r.rates.USD?.toFixed(2)} ₴, 1 EUR = {r.rates.EUR?.toFixed(2)} ₴.
      </p>
    </div>
  );
}
