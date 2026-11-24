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
  const forecast = r.people.flatMap((p) =>
    p.lines
      .filter((l) => l.month === r.now)
      .map((l) => ({ ...l, person: p.name })),
  );
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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-5">
        <Card>
          <CardHead
            title={`Прогноз на ${monthLabel(r.now)}`}
            hint="Если KPI будут выполнены. Фактическая сумма — в начале следующего месяца"
          />
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
                  <tr key={`${l.person}-${l.role}-${l.projectId}`}>
                    <td className="font-semibold">
                      {l.person}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {roleLabel(l.role)}
                      </span>
                    </td>
                    <td>{l.projectName}</td>
                    <td>
                      <Pill tone={KPI_TONE[l.state]}>
                        {l.state === "unknown"
                          ? "нет данных"
                          : l.state === "met"
                            ? "в темпе"
                            : "отстаёт"}
                      </Pill>
                    </td>
                    <td className="text-muted-foreground">{l.rule}</td>
                    <td className="text-right tabular-nums">
                      {l.amount === null ? (
                        <Pill tone="warning">ставка не задана</Pill>
                      ) : (
                        money(l.amount)
                      )}
                    </td>
                    <td className="text-right">
                      <RateButton
                        projectId={l.projectId}
                        projectName={l.projectName}
                        rate={l.rate}
                        kind={l.role}
                        sourcesCount={
                          r.projects.find((x) => x.id === l.projectId)
                            ?.sourcesCount ?? 1
                        }
                        networksCount={
                          r.projects.find((x) => x.id === l.projectId)
                            ?.networksCount ?? 0
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>Нет проектов с назначенным медиабайером или SMM.</Empty>
          )}
        </Card>
        <div className="flex flex-col gap-3 lg:gap-5">
          <Card>
            <CardHead title="Правила медиабайера" />
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                Ставка за проект — <b>${BUYER_RATE_ONE_SOURCE}</b> (один
                источник трафика), <b>$225</b> — два источника. Для 3+
                источников ставка задаётся кнопкой «Ставка» в прогнозе.
              </li>
              <li>
                KPI клиента не выполнен за месяц — <b>−50%</b> ставки.
              </li>
              <li>
                KPI выполняется <b>3+ месяца подряд</b> — с 3-го месяца{" "}
                <b>+50%</b>, и так каждый следующий месяц, пока KPI выполняется.
              </li>
              <li>
                Невыполнение сбрасывает счёт — снова нужно 3 месяца подряд.
              </li>
              <li>
                Проект считается целыми месяцами. Начал работу <b>до {ENTRY_DAY}-го числа</b> — зарплата за этот месяц. Начал
                позже — первая зарплата по проекту пишется на следующий месяц. Дата входа ставится в карточке сотрудника.
              </li>
              <li>
                Клиент зашёл на <b>полмесяца</b> (тест, оплатил половину за текущий месяц) — за этот месяц половина ставки.
              </li>
              <li>
                KPI = главный KPI проекта из «Вводных» (план месяца), факт — из
                «Реальных результатов».
              </li>
              <li>Прогноз текущего месяца считает полную ставку.</li>
            </ul>
          </Card>
          <Card>
            <CardHead title="Правила SMM" />
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                Ставка за проект в месяц — по числу соцсетей: одна —{" "}
                <b>${SMM_RATES.one}</b>, две — <b>${SMM_RATES.two}</b>, три и
                больше — <b>${SMM_RATES.many}</b>. Число берётся из подключённых
                к проекту соцсетей; другую ставку задаёт кнопка «Ставка».
              </li>
              <li>
                Оформление соцсетей (задача на 2–3 недели) —{" "}
                <b>${SMM_SETUP_RATE}</b>: задаётся кнопкой «Ставка» на время
                оформления.
              </li>
              <li>
                KPI не выполнен или клиент отказался от SMM — <b>−50%</b>{" "}
                начальной ставки.
              </li>
              <li>
                KPI выполняется и клиент с нами <b>3+ месяца</b> — с 3-го месяца{" "}
                <b>+50%</b> каждый месяц, пока условия выполняются.
              </li>
              <li>
                Целые месяцы и правило {ENTRY_DAY}-го числа — как у медиабайера. Тест у SMM не оплачивается.
              </li>
              <li>
                Бонусы на проектах с % от дохода начисляются отдельно, по KPI
                дохода бизнеса.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Card>
        <CardHead
          title="Команда"
          hint={`История начислений по месяцам. ${monthLabel(r.now)} — прогноз; потенциал на ${monthLabel(r.nextMonth)} — полный месяц на тех же проектах при выполненных KPI: ${money(r.nextPotential)} на всю команду`}
        />
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
              <th className="!text-right">{monthShort(r.nextMonth)} · потенциал</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {r.people.map((p) => (
              <tr key={p.email}>
                <td>
                  <b>{p.name}</b>
                  <span className="block text-xs text-muted-foreground">
                    {p.staff
                      ? `зарплата с ${p.staff.sinceMonth.split("-").reverse().join(".")}`
                      : "не добавлен в команду"}
                  </span>
                </td>
                <td className="text-muted-foreground">{roleLabel(p.role)}</td>
                {last.map((m) => {
                  const lines = p.lines.filter((l) => l.month === m);
                  // A month already paid out shows what was paid, not what today's rules would give.
                  const total = r.payOf(p, m);
                  return (
                    <td key={m} className="text-right tabular-nums">
                      {total ? (
                        money(total)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {lines.some(
                        (l) => l.streak >= 3 && l.state === "met",
                      ) && (
                        <span className="block text-[11px] text-positive">
                          +50%
                        </span>
                      )}
                      {lines.some(
                        (l) => l.state === "missed" && !l.forecast,
                      ) && (
                        <span className="block text-[11px] text-negative">
                          −50%
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="text-right tabular-nums text-muted-foreground">
                  {p.nextPotential ? money(p.nextPotential) : "—"}
                </td>
                <td className="text-right">
                  <StaffButton
                    staff={p.staff}
                    label={p.staff ? "Изменить" : "Добавить в команду"}
                    defaults={{
                      email: p.email,
                      name: p.name,
                      role: p.role,
                      sinceMonth: r.now,
                    }}
                    options={staffOptions}
                    projects={staffProjects}
                    allProjects={allProjects}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
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
    </div>
  );
}
