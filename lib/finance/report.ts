import { cacheLife, cacheTag } from "next/cache";
import { getProjects } from "@/lib/data";
import { dbSource } from "@/lib/data/sources/db";
import { TAGS } from "@/lib/data/tags";
import { computeStats } from "@/lib/domain/stats";
import type { ResultMetric } from "@/lib/domain/types";
import { addMonths, currentMonth, monthEnd, monthOf, monthStart, monthsBetween } from "@/lib/projects/plans";
import { BASE_CURRENCY, convert, getRates, toBase, type Rates } from "./fx";
import {
  billableStart,
  coveredDays,
  daysIn,
  debtOn,
  firstOf,
  invoiceDay,
  lastOf,
  LEDGER_START,
  nextPeriod,
  paidThrough,
  prepaidOn,
  resolvePeriods,
  serviceDays,
  type Period,
} from "./periods";
import {
  accrue,
  buyerPay,
  defaultBuyerRate,
  defaultSmmRate,
  flatPay,
  PAY_CURRENCY,
  prorateEntry,
  SMM_SETUP_RATE,
  smmPay,
  smmTaskLabel,
  type Accrual,
  type KpiState,
  type PayLine,
  type Terms,
} from "./rules";
import {
  invoiceIn,
  listAssignments,
  listBuyerRates,
  listExpenses,
  listInvoices,
  listMonthTerms,
  listPayouts,
  listPlans,
  listSmmRates,
  listSocialNetworks,
  listStaff,
  listTerms,
  type AgencyPlan,
  type Assignment,
  type Expense,
  type Invoice,
  type MonthTerms,
  type Payout,
  type Staff,
} from "./store";

/** How far back the streak of KPI months is looked at. */
const HISTORY_MONTHS = 24;
/** Months shown in charts and tables. */
const SHOWN_MONTHS = 12;

export interface ProjectMonth {
  month: string;
  revenue: number | null;
  spend: number | null;
  currency: string | null;
  elapsed: number;
  kpi: { metric: ResultMetric; plan: number | null; fact: number; progress: number | null; pace: number | null } | null;
}

/** One project's numbers for one calendar month (cached; invalidated with the project's data). */
async function loadProjectMonth(id: string, month: string): Promise<ProjectMonth | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAGS.projects, TAGS.project(id));
  const p = await dbSource.getProject(id, { start: monthStart(month), end: monthEnd(month) });
  if (!p) return null;
  const stats = computeStats(p, new Date());
  const primary = stats.primary;
  return {
    month,
    revenue: p.metrics.revenue ?? null,
    spend: p.metrics.spend ?? null,
    currency: p.agent.currency,
    elapsed: stats.elapsed,
    kpi: primary
      ? { metric: primary.kpi.metric, plan: primary.kpi.plan, fact: primary.fact, progress: primary.progress, pace: primary.pace }
      : null,
  };
}

export function kpiState(pm: ProjectMonth | null, isCurrent: boolean): KpiState {
  const k = pm?.kpi;
  if (!k) return "unknown";
  const v = isCurrent ? k.pace : k.progress;
  if (v === null) return "unknown";
  return v >= 1 ? "met" : "missed";
}

export interface ProjectFinMonth {
  month: string;
  data: ProjectMonth | null;
  kpi: KpiState;
  /** By the terms, in terms currency; null = no terms for that month. */
  accrual: Accrual | null;
  accrualBase: number;
  /** Money that came in this month (by the day of payment, whatever period it is for), base currency. */
  receivedBase: number;
  /** Issued and not yet paid, base currency. */
  issuedBase: number;
  /** Days of the month the client is in service, and how many of them payments cover. */
  serviceDays: number;
  coveredDays: number;
  forecast: boolean;
}

/** Where a client stands with payments today. Amounts are in the terms currency and in the base one. */
export interface PayState {
  /** The day the client started to be billed. */
  from: string;
  /** The last day covered by payments; null = nothing paid yet. */
  paidThrough: string | null;
  /** Days in service up to today that no payment covers, at the monthly fee. */
  debt: number;
  debtBase: number;
  /** Covered days after today, at the monthly fee: money received for work not done yet. */
  prepaid: number;
  prepaidBase: number;
  currency: string;
  /** The next period to invoice and the day its invoice appears. */
  next: { start: string; end: string; invoiceOn: string };
}

export interface ProjectFin {
  id: string;
  name: string;
  status: string;
  currency: string | null;
  sourcesCount: number;
  mediaBuyerEmail: string | null;
  smmEmail: string | null;
  /** Media buyer's rate for the project, USD; null = not set yet (2+ traffic sources). */
  buyerRate: number | null;
  /** The day the work started (from «Вводные»). */
  startDate: string;
  /** The days each invoice and payment covers, oldest first. */
  periods: Period[];
  /** Payments against the service; null = no terms yet. */
  pay: PayState | null;
  /** Social networks connected to the project and the SMM rate that follows (USD; null = not known yet). */
  networksCount: number;
  smmRate: number | null;
  startMonth: string;
  terms: Terms | null;
  /** Months whose terms differ from the usual ones. */
  overrides: MonthTerms[];
  months: ProjectFinMonth[];
}

export interface PayRow extends PayLine {
  /** Working days paid in the month the person joined the project; null = a full month. */
  days: number | null;
  /** What the line is paid for: running the ads or the social networks of the project. */
  role: "media_buyer" | "smm";
  /** SMM: run | setup | test. Set-up and test are flat amounts, the KPI rule does not touch them. */
  task: string;
  /** Traffic sources / social networks the rate was taken for. */
  sources: number;
  projectId: string;
  projectName: string;
  amountBase: number;
}

export interface PersonPay {
  email: string;
  name: string;
  role: string;
  staff: Staff | null;
  baseSalary: number;
  currency: string;
  lines: PayRow[];
  /** The month after the current one: a full month on the same projects with every KPI met. */
  nextLines: PayRow[];
  /** What the person can earn next month if every project stays and every KPI is met, base currency. */
  nextPotential: number;
  /** Months already paid out: month → the amount paid, base currency. They are never recounted. */
  paid: Record<string, number>;
}

export interface ExpenseLine {
  expense: Expense;
  amountBase: number;
}

export interface PnlMonth {
  month: string;
  revenue: number;
  received: number;
  payroll: number;
  other: number;
  profit: number;
  plan: AgencyPlan | null;
  forecast: boolean;
}

export interface PayoutDue {
  email: string;
  name: string;
  month: string;
  /** What was paid when the month is marked as paid, else what the rules give. */
  amount: number;
  /** What the rules give today (differs from `amount` when the rules changed after the payout). */
  counted: number;
  currency: string;
  lines: PayRow[];
  baseSalary: number;
  paid: Payout | null;
}

/** How much money has to lie in the payroll fund right now, base currency. */
export interface PayrollFund {
  total: number;
  /** Closed months that are counted and not yet marked as paid. */
  unpaid: number;
  /** The current month: every project in work, at the forecast rate. */
  current: number;
  /** The next month, only for projects whose client has already paid for it. */
  next: number;
  nextMonth: string;
  /** Projects paid for the next month (their payroll is in `next`). */
  nextProjects: string[];
}

/** The service period of an invoice or payment as shown in the lists. */
export interface InvoicePeriod {
  start: string;
  end: string;
  /** Worked out from the dates, not typed. */
  auto: boolean;
}

export interface FinanceReport {
  now: string;
  months: string[];
  rates: Rates;
  projects: ProjectFin[];
  people: PersonPay[];
  /** The day each person started on a project (only where it was set). */
  assignments: Assignment[];
  expenses: Expense[];
  invoices: Invoice[];
  /** Service period of every invoice and payment, by invoice id. */
  periodOf: Record<string, InvoicePeriod>;
  /** Today, YYYY-MM-DD: the day debts and prepayments are counted on. */
  today: string;
  plans: AgencyPlan[];
  pnl: PnlMonth[];
  payoutsDue: PayoutDue[];
  payrollFund: PayrollFund;
  /** The month after the current one and the whole team's potential pay for it, base currency. */
  nextMonth: string;
  nextPotential: number;
  expensesFor: (month: string) => ExpenseLine[];
  payrollFor: (month: string) => number;
  /** A person's pay for a month, base currency: the amount paid out when it was, else what the rules give. */
  payOf: (person: PersonPay, month: string) => number;
}

export const nameFromEmail = (email: string) =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter((w) => !/^(eu|ua|com|\d+)$/i.test(w))
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export const expenseActive = (e: Expense, month: string) =>
  e.recurring ? e.startMonth <= month && (!e.endMonth || month <= e.endMonth) : e.startMonth === month;

export async function buildFinanceReport(): Promise<FinanceReport> {
  const now = currentMonth();
  const [allProjects, terms, invoices, expenses, staff, payouts, plans, rates, buyerRates, monthTerms, assignments, smmRates, networks] = await Promise.all([
    getProjects(),
    listTerms(),
    listInvoices(),
    listExpenses(),
    listStaff(),
    listPayouts(),
    listPlans(),
    getRates(),
    listBuyerRates(),
    listMonthTerms(),
    listAssignments(),
    listSmmRates(),
    listSocialNetworks(),
  ]);
  const inBase = (x: Invoice) => invoiceIn(x, BASE_CURRENCY, (a, f, t) => convert(a, f, t, rates));
  const today = new Date().toISOString().slice(0, 10);
  const ledgerMonth = LEDGER_START.slice(0, 7);
  /** The month money came in: by the day of payment, not by the month typed on the invoice. */
  const cashMonth = (x: Invoice) => (x.paidDate ?? x.issueDate).slice(0, 7);
  const termsBy = new Map(terms.map((t) => [t.projectId, t]));
  const projects = allProjects.filter((p) => p.status !== "archived" || termsBy.has(p.id));

  const firstShown = addMonths(now, -(SHOWN_MONTHS - 1));
  const starts = [
    ...terms.map((t) => t.startMonth),
    ...staff.map((s) => s.sinceMonth),
    ...expenses.map((e) => e.startMonth),
  ].filter((m) => m <= now);
  const from = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : now;
  const months = monthsBetween(monthStart(from < firstShown ? firstShown : from), monthStart(now));

  /* ---- per project ---- */
  const finProjects: ProjectFin[] = await Promise.all(
    projects.map(async (p) => {
      const startMonth = monthOf(p.startDate);
      const histFrom = [startMonth, addMonths(now, -(HISTORY_MONTHS - 1))].sort().pop()!;
      const hist = monthsBetween(monthStart(histFrom), monthStart(now));
      const data = await Promise.all(hist.map((m) => loadProjectMonth(p.id, m)));
      const t = termsBy.get(p.id) ?? null;
      const overrides = monthTerms.filter((x) => x.projectId === p.id);
      // What the client's payments cover, by days: everything about «paid / owes» follows from these periods.
      const feeFor = (month: string) => (t ? (overrides.find((o) => o.month === month)?.fixAmount ?? t.fixAmount) : 0);
      const live = invoices.filter((x) => x.projectId === p.id && x.status !== "cancelled");
      const periods = t
        ? resolvePeriods(
            live.map((x) => ({
              id: x.id,
              date: x.status === "paid" ? (x.paidDate ?? x.issueDate) : x.issueDate,
              paid: x.status === "paid",
              amount: invoiceIn(x, t.currency, (a, f, to) => convert(a, f, to, rates)),
              periodStart: x.periodStart,
              periodEnd: x.periodEnd,
            })),
            feeFor,
            p.startDate,
          )
        : [];
      const billFrom = t ? billableStart(periods, p.startDate, firstOf(t.startMonth)) : null;
      const rows: ProjectFinMonth[] = hist.map((month, i) => {
        const d = data[i];
        const forecast = month === now;
        let accrual: Accrual | null = null;
        // From the ledger on, a month is earned by the days the client is in service; a project that starts or is
        // first paid in the middle of a month earns that share of the fee. Earlier months stay whole, as agreed.
        const inService = billFrom && month >= ledgerMonth ? serviceDays(month, billFrom) : daysIn(month);
        if (t && month >= t.startMonth && month >= startMonth && inService > 0) {
          const cur = d?.currency ?? t.currency;
          // The share is counted on what has actually happened: the client's revenue comes in rare payments, so
          // stretching a month-to-date figure to the whole month would promise money that may never come.
          const rev = d?.revenue == null ? null : convert(d.revenue, cur, t.currency, rates);
          const spend = d?.spend == null ? null : convert(d.spend, cur, t.currency, rates);
          // A month can have its own fix / % (set in «Условия по месяцам»).
          const o = overrides.find((x) => x.month === month);
          const pct = o?.sharePct ?? t.sharePct;
          accrual = accrue({ ...t, fixAmount: ((o?.fixAmount ?? t.fixAmount) * inService) / daysIn(month), sharePct: pct, shareBase: t.shareBase ?? (pct ? "client_profit" : null) }, rev, spend);
        }
        const inv = live.filter((x) => x.month === month);
        const got = live.filter((x) => x.status === "paid" && cashMonth(x) === month);
        return {
          month,
          data: d,
          kpi: kpiState(d, forecast),
          accrual,
          accrualBase: accrual ? toBase(accrual.total, accrual.currency, rates) : 0,
          receivedBase: got.reduce((a, x) => a + inBase(x), 0),
          issuedBase: inv.filter((x) => x.status === "issued").reduce((a, x) => a + inBase(x), 0),
          serviceDays: billFrom && month >= ledgerMonth ? inService : 0,
          coveredDays: billFrom && month >= ledgerMonth ? coveredDays(periods, firstOf(month) > billFrom ? firstOf(month) : billFrom, lastOf(month)) : 0,
          forecast,
        };
      });
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        currency: p.agent.currency,
        sourcesCount: p.sources.length,
        mediaBuyerEmail: p.owners.mediaBuyer,
        smmEmail: p.owners.smm,
        buyerRate: buyerRates.get(p.id) ?? t?.buyerRate ?? defaultBuyerRate(p.sources.length),
        startDate: p.startDate,
        periods,
        pay:
          t && billFrom
            ? (() => {
                // A client pays in advance, always. So the days before the first payment on record were paid for
                // before the payments were kept here — they are earned, but they are not a debt. A client with no
                // payment on record at all owes from the first day in service.
                const firstPaid = periods.reduce<string | null>((a, x) => (!a || x.start < a ? x.start : a), null);
                const owedFrom = firstPaid && firstPaid > billFrom ? firstPaid : billFrom;
                const debt = p.status === "active" ? debtOn(today, periods, owedFrom, feeFor) : 0;
                const prepaid = prepaidOn(today, periods, feeFor);
                const next = nextPeriod(periods, billFrom);
                return {
                  from: billFrom,
                  paidThrough: paidThrough(periods),
                  debt,
                  debtBase: toBase(debt, t.currency, rates),
                  prepaid,
                  prepaidBase: toBase(prepaid, t.currency, rates),
                  currency: t.currency,
                  next: { ...next, invoiceOn: invoiceDay(next.start) },
                };
              })()
            : null,
        networksCount: networks.get(p.id) ?? 0,
        smmRate: smmRates.get(p.id) ?? defaultSmmRate(networks.get(p.id) ?? 0),
        startMonth,
        terms: t,
        overrides,
        months: rows,
      };
    }),
  );

  /* ---- payroll ---- */
  const next = addMonths(now, 1);
  const staffBy = new Map(staff.map((s) => [s.email, s]));
  const peopleBy = new Map<string, PersonPay>();
  const person = (email: string, role: string): PersonPay => {
    let p = peopleBy.get(email);
    if (!p) {
      const s = staffBy.get(email) ?? null;
      p = {
        email,
        name: s?.name || nameFromEmail(email),
        role: s?.role ?? role,
        staff: s,
        baseSalary: s?.active === false ? 0 : (s?.baseSalary ?? 0),
        currency: s?.currency ?? PAY_CURRENCY,
        lines: [],
        nextLines: [],
        nextPotential: 0,
        paid: Object.fromEntries(payouts.filter((x) => x.email === email).map((x) => [x.month, toBase(x.amount, x.currency, rates)])),
      };
      peopleBy.set(email, p);
    }
    return p;
  };
  for (const s of staff) if (s.active) person(s.email, s.role);
  for (const fp of finProjects) {
    if (fp.status === "archived") continue;
    // The month after the current one is counted too, with its KPI taken as met: it gives the potential pay and
    // the part of the payroll fund the clients have already paid for.
    const states = [...fp.months.map((m) => ({ month: m.month, state: m.kpi })), { month: next, state: "met" as KpiState }];
    // The same project pays its media buyer and its SMM specialist, each by their own rate. Who works on it:
    // the owners from «Вводные» and everyone put on the project in the payroll card.
    const jobs: { role: "media_buyer" | "smm"; email: string }[] = [];
    if (fp.mediaBuyerEmail) jobs.push({ role: "media_buyer", email: fp.mediaBuyerEmail.toLowerCase() });
    if (fp.smmEmail) jobs.push({ role: "smm", email: fp.smmEmail.toLowerCase() });
    for (const a of assignments) {
      if (a.projectId !== fp.id || (a.role !== "media_buyer" && a.role !== "smm")) continue;
      if (!jobs.some((j) => j.role === a.role && j.email === a.email)) jobs.push({ role: a.role, email: a.email });
    }
    for (const job of jobs) {
      const who = person(job.email, job.role);
      if (who.staff?.active === false) continue;
      const since = who.staff?.sinceMonth ?? now;
      const a = assignments.find((x) => x.projectId === fp.id && x.email === job.email && x.role === job.role);
      const task = job.role === "smm" ? (a?.task ?? "run") : "run";
      const sources = a?.sources ?? (job.role === "smm" ? fp.networksCount : fp.sourcesCount);
      // A rate set by the «Ставка» button wins; otherwise it follows the number of sources the person works with.
      let pay: PayLine[];
      if (job.role === "media_buyer") {
        pay = buyerPay(states, buyerRates.get(fp.id) ?? fp.terms?.buyerRate ?? defaultBuyerRate(sources), now);
      } else if (task === "run") {
        pay = smmPay(states, smmRates.get(fp.id) ?? defaultSmmRate(sources), now);
      } else {
        const flat = smmRates.get(fp.id) ?? (task === "setup" ? SMM_SETUP_RATE : null);
        pay = flatPay(states.map((x) => x.month), flat, now, smmTaskLabel(task));
      }
      // Joined the project in the middle of a month → that month is paid by working days, later ones in full.
      for (const line of prorateEntry(pay, a?.startDate ?? null)) {
        if (line.month < since || line.month < fp.startMonth) continue;
        const row: PayRow = { ...line, role: job.role, task, sources, projectId: fp.id, projectName: fp.name, amountBase: line.amount === null ? 0 : toBase(line.amount, PAY_CURRENCY, rates) };
        if (line.month === next) who.nextLines.push(row);
        else who.lines.push(row);
      }
    }
  }
  const people = [...peopleBy.values()];
  const baseSalaryFor = (p: PersonPay, month: string) =>
    p.baseSalary > 0 && (!p.staff || p.staff.sinceMonth <= month) ? p.baseSalary : 0;
  for (const p of people) p.nextPotential = p.nextLines.reduce((a, l) => a + l.amountBase, 0) + toBase(baseSalaryFor(p, next), p.currency, rates);
  /** What a person's month is by the rules as they are now, base currency. */
  const countedFor = (p: PersonPay, month: string) =>
    p.lines.filter((l) => l.month === month).reduce((s, l) => s + l.amountBase, 0) + toBase(baseSalaryFor(p, month), p.currency, rates);
  // A month already paid out stays what was paid: later rules and later edits do not rewrite the past.
  const payOf = (p: PersonPay, month: string) => p.paid[month] ?? countedFor(p, month);
  const payrollFor = (month: string) => people.reduce((a, p) => a + payOf(p, month), 0);

  const expensesFor = (month: string): ExpenseLine[] =>
    expenses.filter((e) => expenseActive(e, month)).map((e) => ({ expense: e, amountBase: toBase(e.amount, e.currency, rates) }));

  /* ---- P&L ---- */
  const plansBy = new Map(plans.map((p) => [p.month, p]));
  const pnl: PnlMonth[] = months.map((month) => {
    const revenue = finProjects.reduce((a, p) => a + (p.months.find((m) => m.month === month)?.accrualBase ?? 0), 0);
    // Every payment of the month, with the ones not tied to a project.
    const received = invoices.filter((x) => x.status === "paid" && cashMonth(x) === month).reduce((a, x) => a + inBase(x), 0);
    const payroll = payrollFor(month);
    const other = expensesFor(month).reduce((a, e) => a + e.amountBase, 0);
    return { month, revenue, received, payroll, other, profit: revenue - payroll - other, plan: plansBy.get(month) ?? null, forecast: month === now };
  });

  /* ---- payouts for the previous month ---- */
  const prev = addMonths(now, -1);
  const payoutsDue: PayoutDue[] = people
    .map((p) => {
      const lines = p.lines.filter((l) => l.month === prev);
      const baseSalary = baseSalaryFor(p, prev);
      const counted = lines.reduce((a, l) => a + (l.amount ?? 0), 0) + baseSalary;
      const paid = payouts.find((x) => x.email === p.email && x.month === prev) ?? null;
      return {
        email: p.email,
        name: p.name,
        month: prev,
        amount: paid ? paid.amount : counted,
        counted,
        currency: PAY_CURRENCY,
        lines,
        baseSalary,
        paid,
      };
    })
    .filter((d) => d.amount > 0 || d.lines.length);

  /* ---- payroll fund: what is already owed + what the clients have paid ahead for ---- */
  // The share of the next month each client has paid for, by days: a client paid until the 16th covers 16 days of it.
  const nextCover = new Map(
    finProjects.map((p) => [p.id, p.pay ? coveredDays(p.periods, firstOf(next) > p.pay.from ? firstOf(next) : p.pay.from, lastOf(next)) / daysIn(next) : 0]),
  );
  const nextPayroll = people.reduce((a, p) => a + p.nextLines.reduce((s, l) => s + l.amountBase * (nextCover.get(l.projectId) ?? 0), 0), 0);
  const unpaidPayroll = payoutsDue.filter((d) => !d.paid).reduce((a, d) => a + toBase(d.amount, d.currency, rates), 0);
  const currentPayroll = payrollFor(now);
  const payrollFund: PayrollFund = {
    total: unpaidPayroll + currentPayroll + nextPayroll,
    unpaid: unpaidPayroll,
    current: currentPayroll,
    next: nextPayroll,
    nextMonth: next,
    nextProjects: finProjects
      .filter((p) => (nextCover.get(p.id) ?? 0) > 0)
      .map((p) => ((nextCover.get(p.id) ?? 0) >= 1 ? p.name : `${p.name} по ${p.pay!.paidThrough!.slice(8, 10)}.${p.pay!.paidThrough!.slice(5, 7)}`)),
  };

  const periodOf: Record<string, InvoicePeriod> = {};
  for (const p of finProjects) for (const x of p.periods) periodOf[x.id] = { start: x.start, end: x.end, auto: x.auto };

  return {
    now,
    months,
    rates,
    projects: finProjects,
    people,
    assignments,
    expenses,
    invoices,
    periodOf,
    today,
    plans,
    pnl,
    payoutsDue,
    payrollFund,
    nextMonth: next,
    nextPotential: people.reduce((a, p) => a + p.nextPotential, 0),
    expensesFor,
    payrollFor,
    payOf,
  };
}

export { BASE_CURRENCY };
