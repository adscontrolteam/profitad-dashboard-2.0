import type { Metadata } from "next";
import {
  PayoutButton,
  StaffButton,
  type StaffOption,
  type StaffProject,
} from "@/components/finance/payroll-ui";
import { RateButton } from "@/components/finance/rate-button";
import {
  CardHead,
  dateLabel,
  Empty,
  KpiTile,
  monthLabel,
  monthShort,
  Pill,
  Table,
} from "@/components/finance/ui";
import { Card } from "@/components/ui/card";
import { listGrants } from "@/lib/access/store";
import { requireSection } from "@/lib/access/viewer";
import { money } from "@/lib/finance/fx";
import { KPI_LABEL, KPI_TONE, roleLabel } from "@/lib/finance/labels";
import { buildFinanceReport, nameFromEmail } from "@/lib/finance/report";
import {
  BUYER_RATE_ONE_SOURCE,
  SMM_RATES,
  SMM_SETUP_RATE,
  ENTRY_DAY,
} from "@/lib/finance/rules";

export const metadata: Metadata = { title: "Financial · Зарплаты" };

export default async function FinancePayrollPage() {
  await requireSection("finance");
  const [r, grants] = await Promise.all([buildFinanceReport(), listGrants()]);

  // Projects each person works on: the owners from «Вводные» and those put on a project in the payroll card.
  const active = r.projects.filter((p) => p.status !== "archived");
  const staffProjects: StaffProject[] = active.flatMap((p) => {
    const owners = new Map<string, string>();
    if (p.mediaBuyerEmail) owners.set("media_buyer", p.mediaBuyerEmail.toLowerCase());
    if (p.smmEmail) owners.set("smm", p.smmEmail.toLowerCase());
    const rows = [...owners].map(([role, email]) => ({ role, email }));
    for (const a of r.assignments)
      if (a.projectId === p.id && !rows.some((x) => x.role === a.role && x.email === a.email)) rows.push({ role: a.role, email: a.email });
    return rows.map(({ role, email }) => {
      const a = r.assignments.find((x) => x.projectId === p.id && x.email === email && x.role === role);
      return {
        email,
        projectId: p.id,
        projectName: p.name,
        role,
        startDate: a?.startDate ?? null,
        projectStart: p.startMonth,
        task: a?.task ?? "run",
        sources: a?.sources ?? null,
        autoSources: role === "smm" ? p.networksCount : p.sourcesCount,
        owner: owners.get(role) === email,
      };
    });
  });
  const allProjects = active.map((p) => ({ id: p.id, name: p.name }));
  // Everyone who can be picked by email: the team, project owners, people with access to the dashboard.
  const known = new Map<string, StaffOption>();
  for (const g of grants)
    known.set(g.email.toLowerCase(), {
      email: g.email.toLowerCase(),
      name: nameFromEmail(g.email),
      role: "other",
    });
  for (const sp of staffProjects)
    known.set(sp.email, {
      email: sp.email,
      name: nameFromEmail(sp.email),
      role: sp.role,
    });
  for (const p of r.people)
    known.set(p.email.toLowerCase(), {
      email: p.email.toLowerCase(),
      name: p.name,
      role: p.role,
    });
  const staffOptions = [...known.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );
  const prevMonth = r.payoutsDue[0]?.month;
  const dueTotal = r.payoutsDue
    .filter((p) => !p.paid)
    .reduce((a, p) => a + p.amount, 0);
  const forecastTotal = r.payrollFor(r.now);
  const cur = r.pnl[r.pnl.length - 1];
  const last = r.months.slice(-6);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:gap-5 xl:grid-cols-5">
        <KpiTile label="ЗП фонд" value={money(r.payrollFund.total)} highlight>
          <span>столько должно лежать на зарплаты</span>
          <span className="w-full">
            {r.payrollFund.unpaid > 0 ? `не выплачено ${money(r.payrollFund.unpaid)} · ` : ""}
            {monthLabel(r.now)} {money(r.payrollFund.current)}
          </span>
          <span className="w-full">
            {monthLabel(r.payrollFund.nextMonth)}{" "}
            {r.payrollFund.next > 0 ? `${money(r.payrollFund.next)} · оплатили: ${r.payrollFund.nextProjects.join(", ")}` : "— ещё никто не оплатил"}
          </span>
        </KpiTile>
        <KpiTile
          label={
            prevMonth ? `К выплате за ${monthLabel(prevMonth)}` : "К выплате"
          }
          value={money(dueTotal)}
        >
          <span>
            {dueTotal > 0 ? "выплатить в начале месяца" : "всё выплачено"}
          </span>
        </KpiTile>
        <KpiTile
          label={`Прогноз за ${monthLabel(r.now)}`}
          value={money(forecastTotal)}
        >
          <span>по полной ставке там, где KPI выполняется</span>
        </KpiTile>
        <KpiTile
          label="Доля зарплат в доходе"
          value={
            cur.revenue
              ? `${Math.round((cur.payroll / cur.revenue) * 100)}%`
              : "—"
          }
        >
          <Pill
            tone={
              cur.revenue && cur.payroll / cur.revenue <= 0.5
                ? "good"
                : "warning"
            }
          >
            ориентир ≤ 50%
          </Pill>
        </KpiTile>
        <KpiTile label="В команде" value={String(r.people.length)}>
          <span>получают зарплату через дашборд</span>
        </KpiTile>
      </div>

      <Card>
        <CardHead
          title={
            prevMonth
              ? `Выплаты за ${monthLabel(prevMonth)}`
              : "Выплаты за прошлый месяц"
          }
          hint="Считается автоматически по KPI клиентов за закрытый месяц. Отметьте, когда выплатите"
        />
        {r.payoutsDue.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {r.payoutsDue.map((p) => (
              <div
                key={p.email}
                className="rounded-[20px] border border-border bg-background/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <b>{p.name}</b>
                  <span className="text-xs text-muted-foreground">
                    {p.email}
                  </span>
                  <span className="ml-auto font-display text-2xl font-extrabold tabular-nums">
                    {money(p.amount)}
                  </span>
                </div>
                {p.paid && Math.abs(p.amount - p.counted) >= 1 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Выплачено {money(p.amount)}. По нынешним правилам вышло бы{" "}
                    {money(p.counted)} — строки ниже показывают этот расчёт,
                    выплаченный месяц не пересчитывается.
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {p.lines.map((l) => (
                    <div
                      key={`${l.role}-${l.projectId}`}
                      className="flex flex-wrap items-center gap-2 border-t border-border pt-2"
                    >
                      <span className="font-medium">{l.projectName}</span>
                      <span className="text-xs text-muted-foreground">
                        {roleLabel(l.role)}
                      </span>
                      <Pill tone={KPI_TONE[l.state]}>{KPI_LABEL[l.state]}</Pill>
                      <span className="w-full text-xs text-muted-foreground sm:w-auto">
                        {l.rule}
                      </span>
                      <span className="ml-auto tabular-nums">
                        {l.amount === null ? "ставка?" : money(l.amount)}
                      </span>
                    </div>
                  ))}
                  {p.baseSalary > 0 && (
                    <div className="flex items-center gap-2 border-t border-border pt-2">
                      <span>Оклад</span>
                      <span className="ml-auto tabular-nums">
                        {money(p.baseSalary)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {p.paid ? (
                    <Pill tone="good">
                      Выплачено {dateLabel(p.paid.paidAt.slice(0, 10))}
                    </Pill>
                  ) : (
                    <Pill tone="warning">Не выплачено</Pill>
                  )}
                  <span className="ml-auto">
                    <PayoutButton
                      email={p.email}
                      month={p.month}
                      amount={p.amount}
                      paid={Boolean(p.paid)}
                      breakdown={p.lines.map((l) => ({
                        project: l.projectName,
                        role: l.role,
                        state: l.state,
                        rule: l.rule,
                        amount: l.amount,
                      }))}
                    />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>За прошлый месяц начислений нет.</Empty>
        )}
      </Card>

      <Card>
        <CardHead
          title="Команда"
          hint={`По каждому человеку — его проекты: ${monthLabel(r.now)} (прогноз, KPI считается выполненным) и ${monthLabel(r.nextMonth)} (полный месяц на тех же проектах). На всю команду в ${monthLabel(r.nextMonth)}: ${money(r.nextPotential)}`}
        />
        <div className="flex flex-col gap-4">
          {r.people.map((p) => {
            const nowLines = p.lines.filter((l) => l.month === r.now);
            const keys = [...new Set([...nowLines, ...p.nextLines].map((l) => `${l.role}|${l.projectId}`))];
            const history = last.filter((m) => m < r.now && r.payOf(p, m) > 0);
            return (
              <div key={p.email} className="rounded-[20px] border border-border bg-background/70 p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <b>{p.name}</b>
                    <span className="ml-2 text-sm text-muted-foreground">{roleLabel(p.role)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.staff ? `зарплата с ${p.staff.sinceMonth.split("-").reverse().join(".")}` : "не добавлен в команду"}
                      {history.length ? ` · ${history.map((m) => `${monthShort(m)} ${money(r.payOf(p, m))}`).join(" · ")}` : ""}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-5 text-right tabular-nums">
                    <div>
                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{monthShort(r.now)}</span>
                      <b className="font-display text-xl">{money(r.payOf(p, r.now))}</b>
                    </div>
                    <div>
                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{monthShort(r.nextMonth)}</span>
                      <b className="font-display text-xl text-muted-foreground">{p.nextPotential ? money(p.nextPotential) : "—"}</b>
                    </div>
                    <StaffButton
                      staff={p.staff}
                      label={p.staff ? "Изменить" : "Добавить в команду"}
                      defaults={{ email: p.email, name: p.name, role: p.role, sinceMonth: r.now }}
                      options={staffOptions}
                      projects={staffProjects}
                      allProjects={allProjects}
                    />
                  </div>
                </div>
                {keys.length > 0 && (
                  <div className="mt-3">
                    <Table>
                      <thead>
                        <tr>
                          <th>Проект</th>
                          <th>KPI сейчас</th>
                          <th className="!text-right">{monthShort(r.now)}</th>
                          <th className="!text-right">{monthShort(r.nextMonth)}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((key) => {
                          const cur = nowLines.filter((l) => `${l.role}|${l.projectId}` === key);
                          const nxt = p.nextLines.filter((l) => `${l.role}|${l.projectId}` === key);
                          const any = cur[0] ?? nxt[0];
                          const project = r.projects.find((x) => x.id === any.projectId);
                          const sum = (list: typeof cur) => list.reduce((a, l) => a + (l.amount ?? 0), 0);
                          const noRate = (list: typeof cur) => list.some((l) => l.amount === null);
                          // The next month is in the payroll fund once the client has paid for it.
                          const funded = project?.paidFor(r.nextMonth) === "full";
                          return (
                            <tr key={key}>
                              <td>
                                <span className="font-medium">{any.projectName}</span>
                                {p.role !== any.role && <span className="ml-2 text-xs text-muted-foreground">{roleLabel(any.role)}</span>}
                                <span className="block text-xs text-muted-foreground">{(cur[0] ?? nxt[0]).rule}</span>
                              </td>
                              <td>
                                {cur.length ? (
                                  <Pill tone={KPI_TONE[cur[0].state]}>
                                    {cur[0].state === "unknown" ? "нет данных" : cur[0].state === "met" ? "в темпе" : "отстаёт"}
                                  </Pill>
                                ) : (
                                  <span className="text-xs text-muted-foreground">с {monthShort(r.nextMonth)}</span>
                                )}
                              </td>
                              <td className="text-right tabular-nums">
                                {!cur.length ? <span className="text-muted-foreground">—</span> : noRate(cur) ? <Pill tone="warning">ставка?</Pill> : money(sum(cur))}
                              </td>
                              <td className="text-right tabular-nums">
                                {!nxt.length ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : noRate(nxt) ? (
                                  <Pill tone="warning">ставка?</Pill>
                                ) : (
                                  <>
                                    {money(sum(nxt))}
                                    <span className={`block text-[11px] ${funded ? "text-positive" : "text-muted-foreground"}`}>
                                      {funded ? "клиент оплатил" : "ждём оплату клиента"}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="text-right">
                                <RateButton
                                  projectId={any.projectId}
                                  projectName={any.projectName}
                                  rate={any.rate}
                                  kind={any.role}
                                  sourcesCount={project?.sourcesCount ?? 1}
                                  networksCount={project?.networksCount ?? 0}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
          {r.people.length === 0 && <Empty>В команде пока никого нет.</Empty>}
        </div>
        <div className="mt-4">
          <StaffButton
            staff={null}
            label="+ Сотрудник"
            defaults={{ email: "", name: "", role: "smm", sinceMonth: r.now }}
            options={staffOptions}
            projects={staffProjects}
            allProjects={allProjects}
          />
        </div>
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer select-none font-semibold">Правила расчёта зарплаты</summary>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="section-kicker mb-2">Общее</p>
              <ul className="flex flex-col gap-2 text-sm">
                <li>
                  Проект считается целыми месяцами. Начал работу <b>до {ENTRY_DAY}-го числа</b> — зарплата за этот месяц; позже — первая зарплата пишется на
                  следующий. Дата входа ставится в карточке сотрудника.
                </li>
                <li>KPI клиента не выполнен за месяц — <b>−50%</b> ставки.</li>
                <li>
                  KPI выполняется <b>3+ месяца подряд</b> — с 3-го месяца <b>+50%</b>, пока выполняется. Невыполнение сбрасывает счёт.
                </li>
                <li>KPI = главный KPI проекта из «Вводных», факт — из «Реальных результатов». Текущий месяц считается по полной ставке.</li>
                <li>
                  <b>ЗП фонд</b> — сколько предстоит выплатить: невыплаченное за закрытый месяц, зарплаты текущего месяца и следующий месяц по проектам, за которые
                  клиент уже заплатил.
                </li>
              </ul>
            </div>
            <div>
              <p className="section-kicker mb-2">Ставки</p>
              <ul className="flex flex-col gap-2 text-sm">
                <li>
                  <b>Медиабайер:</b> ${BUYER_RATE_ONE_SOURCE} за проект с одним источником трафика, $225 — с двумя; три и больше — кнопкой «Ставка».
                </li>
                <li>
                  <b>Медиабайер, тест:</b> клиент зашёл на полмесяца (оплатил часть суммы за текущий месяц) — половина ставки за этот месяц.
                </li>
                <li>
                  <b>SMM:</b> одна соцсеть — ${SMM_RATES.one}, две — ${SMM_RATES.two}, три и больше — ${SMM_RATES.many}. Оформление соцсетей — $
                  {SMM_SETUP_RATE}. Тест у SMM не оплачивается.
                </li>
                <li>Бонусы на проектах с % от дохода начисляются отдельно, по KPI дохода бизнеса.</li>
              </ul>
            </div>
          </div>
        </details>
      </Card>
    </div>
  );
}
