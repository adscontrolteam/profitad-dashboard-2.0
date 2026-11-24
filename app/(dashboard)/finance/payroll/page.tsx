import type { Metadata } from "next";
import { PayoutButton, StaffButton, type StaffOption, type StaffProject } from "@/components/finance/payroll-ui";
import { RateButton } from "@/components/finance/rate-button";
import { CardHead, dateLabel, Empty, KpiTile, monthLabel, monthShort, Pill, Table } from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { listGrants } from "@/lib/access/store";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { KPI_LABEL, KPI_TONE, roleLabel } from "@/lib/finance/labels";
import { buildFinanceReport, nameFromEmail } from "@/lib/finance/report";
import { BUYER_RATE_ONE_SOURCE, WORKDAYS_PER_MONTH } from "@/lib/finance/rules";

export const metadata: Metadata = { title: "Financial · Зарплаты" };

export default async function FinancePayrollPage() {
  await requireSection("finance");
  const [r, grants] = await Promise.all([buildFinanceReport(), listGrants()]);

  // Projects each person is responsible for, with the day they started there.
  const staffProjects: StaffProject[] = r.projects
    .filter((p) => p.status !== "archived")
    .flatMap((p) =>
      (
        [
          ["media_buyer", p.mediaBuyerEmail],
          ["smm", p.smmEmail],
        ] as const
      ).flatMap(([role, email]) =>
        email
          ? [
              {
                email: email.toLowerCase(),
                projectId: p.id,
                projectName: p.name,
                role,
                startDate: r.assignments.find((a) => a.projectId === p.id && a.email === email.toLowerCase() && a.role === role)?.startDate ?? null,
                projectStart: p.startMonth,
              },
            ]
          : [],
      ),
    );
  // Everyone who can be picked by email: the team, project owners, people with access to the dashboard.
  const known = new Map<string, StaffOption>();
  for (const g of grants) known.set(g.email.toLowerCase(), { email: g.email.toLowerCase(), name: nameFromEmail(g.email), role: "other" });
  for (const sp of staffProjects) known.set(sp.email, { email: sp.email, name: nameFromEmail(sp.email), role: sp.role });
  for (const p of r.people) known.set(p.email.toLowerCase(), { email: p.email.toLowerCase(), name: p.name, role: p.role });
  const staffOptions = [...known.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const prevMonth = r.payoutsDue[0]?.month;
  const dueTotal = r.payoutsDue.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0);
  const forecast = r.people.flatMap((p) => p.lines.filter((l) => l.month === r.now).map((l) => ({ ...l, person: p.name })));
  const forecastTotal = r.payrollFor(r.now);
  const cur = r.pnl[r.pnl.length - 1];
  const last = r.months.slice(-6);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-4">
        <KpiTile label={prevMonth ? `К выплате за ${monthLabel(prevMonth)}` : "К выплате"} value={money(dueTotal)} highlight={dueTotal > 0}>
          <span>{dueTotal > 0 ? "выплатить в начале месяца" : "всё выплачено"}</span>
        </KpiTile>
        <KpiTile label={`Прогноз за ${monthLabel(r.now)}`} value={money(forecastTotal)}>
          <span>по полной ставке там, где KPI выполняется</span>
        </KpiTile>
        <KpiTile label="Доля зарплат в доходе" value={cur.revenue ? `${Math.round((cur.payroll / cur.revenue) * 100)}%` : "—"}>
          <Pill tone={cur.revenue && cur.payroll / cur.revenue <= 0.5 ? "good" : "warning"}>ориентир ≤ 50%</Pill>
        </KpiTile>
        <KpiTile label="В команде" value={String(r.people.length)}>
          <span>получают зарплату через дашборд</span>
        </KpiTile>
      </div>

      <Card>
        <CardHead
          title={prevMonth ? `Выплаты за ${monthLabel(prevMonth)}` : "Выплаты за прошлый месяц"}
          hint="Считается автоматически по KPI клиентов за закрытый месяц. Отметьте, когда выплатите"
        />
        {r.payoutsDue.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {r.payoutsDue.map((p) => (
              <div key={p.email} className="rounded-[20px] border border-border bg-background/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{p.name}</b>
                  <span className="text-xs text-muted-foreground">{p.email}</span>
                  <span className="ml-auto font-display text-2xl font-extrabold tabular-nums">{money(p.amount)}</span>
                </div>
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {p.lines.map((l) => (
                    <div key={l.projectId} className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                      <span className="font-medium">{l.projectName}</span>
                      <Pill tone={KPI_TONE[l.state]}>{KPI_LABEL[l.state]}</Pill>
                      <span className="w-full text-xs text-muted-foreground sm:w-auto">{l.rule}</span>
                      <span className="ml-auto tabular-nums">{l.amount === null ? "ставка?" : money(l.amount)}</span>
                    </div>
                  ))}
                  {p.baseSalary > 0 && (
                    <div className="flex items-center gap-2 border-t border-border pt-2">
                      <span>Оклад</span>
                      <span className="ml-auto tabular-nums">{money(p.baseSalary)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {p.paid ? <Pill tone="good">Выплачено {dateLabel(p.paid.paidAt.slice(0, 10))}</Pill> : <Pill tone="warning">Не выплачено</Pill>}
                  <span className="ml-auto">
                    <PayoutButton email={p.email} month={p.month} amount={p.amount} paid={Boolean(p.paid)} breakdown={p.lines.map((l) => ({ project: l.projectName, state: l.state, rule: l.rule, amount: l.amount }))} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>За прошлый месяц начислений нет.</Empty>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-5">
        <Card>
          <CardHead title={`Прогноз на ${monthLabel(r.now)}`} hint="Если KPI будут выполнены. Фактическая сумма — в начале следующего месяца" />
          {forecast.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Проект</th>
                  <th>Сейчас</th>
                  <th>Правило</th>
                  <th className="!text-right">Сумма</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((l) => (
                  <tr key={`${l.person}-${l.projectId}`}>
                    <td className="font-semibold">{l.person}</td>
                    <td>{l.projectName}</td>
                    <td>
                      <Pill tone={KPI_TONE[l.state]}>{l.state === "unknown" ? "нет данных" : l.state === "met" ? "в темпе" : "отстаёт"}</Pill>
                    </td>
                    <td className="text-muted-foreground">{l.rule}</td>
                    <td className="text-right tabular-nums">{l.amount === null ? <Pill tone="warning">ставка не задана</Pill> : money(l.amount)}</td>
                    <td className="text-right">
                      <RateButton projectId={l.projectId} projectName={l.projectName} rate={l.rate} sourcesCount={r.projects.find((x) => x.id === l.projectId)?.sourcesCount ?? 1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>Нет проектов с назначенным медиабайером.</Empty>
          )}
        </Card>
        <Card>
          <CardHead title="Правила медиабайера" />
          <ul className="flex flex-col gap-2.5 text-sm">
            <li>Ставка за проект — <b>${BUYER_RATE_ONE_SOURCE}</b> (один источник трафика). Для 2+ источников ставка задаётся кнопкой «Ставка» в прогнозе.</li>
            <li>KPI клиента не выполнен за месяц — <b>−50%</b> ставки.</li>
            <li>KPI выполняется <b>3+ месяца подряд</b> — с 3-го месяца <b>+50%</b>, и так каждый следующий месяц, пока KPI выполняется.</li>
            <li>Невыполнение сбрасывает счёт — снова нужно 3 месяца подряд.</li>
            <li>
              Вошёл на проект не с начала месяца — этот месяц считается по рабочим дням: ставка <b>÷ {WORKDAYS_PER_MONTH}</b> × отработанные дни (при
              невыполненном KPI — от половины ставки). Со следующего месяца — ровно по месяцам. Дата входа ставится в карточке сотрудника.
            </li>
            <li>KPI = главный KPI проекта из «Вводных» (план месяца), факт — из «Реальных результатов».</li>
            <li>Прогноз текущего месяца считает полную ставку.</li>
          </ul>
        </Card>
      </div>

      <Card>
        <CardHead title="Команда" hint="История начислений по месяцам. Последний месяц — прогноз" />
        <Table>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Роль</th>
              {last.map((m) => (
                <th key={m} className="!text-right">
                  {monthShort(m)}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {r.people.map((p) => (
              <tr key={p.email}>
                <td>
                  <b>{p.name}</b>
                  <span className="block text-xs text-muted-foreground">{p.staff ? `зарплата с ${p.staff.sinceMonth.split("-").reverse().join(".")}` : "не добавлен в команду"}</span>
                </td>
                <td className="text-muted-foreground">{roleLabel(p.role)}</td>
                {last.map((m) => {
                  const lines = p.lines.filter((l) => l.month === m);
                  const total = lines.reduce((a, l) => a + (l.amount ?? 0), 0) + (p.baseSalary && (!p.staff || p.staff.sinceMonth <= m) ? p.baseSalary : 0);
                  return (
                    <td key={m} className="text-right tabular-nums">
                      {total ? money(total) : <span className="text-muted-foreground">—</span>}
                      {lines.some((l) => l.streak >= 3 && l.state === "met") && <span className="block text-[11px] text-positive">+50%</span>}
                      {lines.some((l) => l.state === "missed" && !l.forecast) && <span className="block text-[11px] text-negative">−50%</span>}
                    </td>
                  );
                })}
                <td className="text-right">
                  <StaffButton
                    staff={p.staff}
                    label={p.staff ? "Изменить" : "Добавить в команду"}
                    defaults={{ email: p.email, name: p.name, role: p.role, sinceMonth: r.now }}
                    options={staffOptions}
                    projects={staffProjects}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-4">
          <StaffButton staff={null} label="+ Сотрудник" defaults={{ email: "", name: "", role: "smm", sinceMonth: r.now }} options={staffOptions} projects={staffProjects} />
        </div>
      </Card>
    </div>
  );
}
