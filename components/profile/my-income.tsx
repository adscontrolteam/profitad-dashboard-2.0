import { monthShort, Pill, Table } from "@/components/finance/ui";
import { KPI_TONE, roleLabel } from "@/lib/finance/labels";
import { money, toBase } from "@/lib/finance/fx";
import type { FinanceReport, PayRow } from "@/lib/finance/report";

/**
 * «Твой доход» in the profile: the person's own payroll card, read-only. Unlike the payroll page (which forecasts the
 * current month at the full rate), the current month here follows the real KPI pace: in pace — the rate (+50% from the
 * 3rd month in a row), behind — half of it. The next month is what can be earned if the KPI is in pace.
 */

/** The current month by the real KPI pace. Flat lines (set-up, tests) are not touched by KPI. */
function realNow(l: PayRow) {
  if (l.rate === null) return { amount: null, rule: l.rule };
  const kpi = l.task === "run";
  if (!kpi) return { amount: l.amount, rule: l.rule };
  if (l.state === "missed") return { amount: l.rate * 0.5, rule: `KPI отстаёт: −50%. В темпе будет ${money(l.streak >= 3 ? l.rate * 1.5 : l.rate)}` };
  if (l.state === "unknown") return { amount: l.rate, rule: "Нет данных KPI: базовая ставка" };
  return l.streak >= 3
    ? { amount: l.rate * 1.5, rule: `KPI в темпе ${l.streak}-й месяц подряд: +50%` }
    : { amount: l.rate, rule: l.streak === 2 ? "KPI в темпе 2-й месяц подряд. Следующий — +50%" : "KPI в темпе: полная ставка" };
}

/** The next month if the KPI is in pace, counting the streak from the real current state. */
function realNext(next: PayRow, cur: PayRow | undefined) {
  if (next.rate === null) return null;
  if (!cur || next.task !== "run" || cur.task !== "run") return next.amount;
  const streak = (cur.state === "met" ? cur.streak : 0) + 1;
  return next.rate * (streak >= 3 ? 1.5 : 1);
}

export function MyIncome({ report: r, email }: { report: FinanceReport; email: string }) {
  const p = r.people.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!p) return null;
  const nowLines = p.lines.filter((l) => l.month === r.now);
  const keys = [...new Set([...nowLines, ...p.nextLines].map((l) => `${l.role}|${l.projectId}`))];
  if (!keys.length && !p.baseSalary) return null;

  const salaryNow = p.baseSalary > 0 && (!p.staff || p.staff.sinceMonth <= r.now) ? toBase(p.baseSalary, p.currency, r.rates) : 0;
  const salaryNext = p.baseSalary > 0 && (!p.staff || p.staff.sinceMonth <= r.nextMonth) ? toBase(p.baseSalary, p.currency, r.rates) : 0;

  const rows = keys.map((key) => {
    const cur = nowLines.find((l) => `${l.role}|${l.projectId}` === key);
    const nxt = p.nextLines.find((l) => `${l.role}|${l.projectId}` === key);
    const now = cur ? realNow(cur) : null;
    return { key, cur, nxt, any: (cur ?? nxt)!, now, next: nxt ? realNext(nxt, cur) : null };
  });
  const totalNow = rows.reduce((a, x) => a + (x.now?.amount ?? 0), 0) + salaryNow;
  const totalNext = rows.reduce((a, x) => a + (x.next ?? 0), 0) + salaryNext;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="section-title">Твой доход</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {monthShort(r.now)} — по тому, как KPI идут сейчас · {monthShort(r.nextMonth)} — сколько можно заработать, если KPI в темпе
          </p>
        </div>
        <div className="flex items-center gap-6 text-right tabular-nums">
          <div>
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{monthShort(r.now)} сейчас</span>
            <b className="font-display text-2xl">{money(totalNow)}</b>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{monthShort(r.nextMonth)} потенциал</span>
            <b className="font-display text-2xl text-positive">{money(totalNext)}</b>
          </div>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Проект</th>
            <th>KPI сейчас</th>
            <th className="!text-right">{monthShort(r.now)}</th>
            <th className="!text-right">{monthShort(r.nextMonth)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cur, any, now, next, nxt }) => (
            <tr key={key}>
              <td>
                <span className="font-medium">{any.projectName}</span>
                {p.role !== any.role && <span className="ml-2 text-xs text-muted-foreground">{roleLabel(any.role)}</span>}
                <span className="block text-xs text-muted-foreground">{now?.rule ?? any.rule}</span>
              </td>
              <td>
                {cur ? (
                  cur.task === "run" ? (
                    <Pill tone={KPI_TONE[cur.state]}>{cur.state === "unknown" ? "нет данных" : cur.state === "met" ? "в темпе" : "отстаёт"}</Pill>
                  ) : (
                    <span className="text-xs text-muted-foreground">без KPI</span>
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">с {monthShort(r.nextMonth)}</span>
                )}
              </td>
              <td className="text-right tabular-nums">
                {!cur ? <span className="text-muted-foreground">—</span> : now?.amount === null ? <span className="text-muted-foreground">уточняется</span> : money(now?.amount)}
              </td>
              <td className="text-right tabular-nums">
                {!nxt ? <span className="text-muted-foreground">—</span> : next === null ? <span className="text-muted-foreground">уточняется</span> : money(next)}
              </td>
            </tr>
          ))}
          {p.baseSalary > 0 && (
            <tr>
              <td>
                <span className="font-medium">Оклад</span>
              </td>
              <td />
              <td className="text-right tabular-nums">{salaryNow ? money(p.baseSalary, p.currency) : "—"}</td>
              <td className="text-right tabular-nums">{salaryNext ? money(p.baseSalary, p.currency) : "—"}</td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
