import { cacheLife, cacheTag } from "next/cache";
import { getProjects } from "@/lib/data";
import { dbSource } from "@/lib/data/sources/db";
import { TAGS } from "@/lib/data/tags";
import { computeStats } from "@/lib/domain/stats";
import type { ResultMetric } from "@/lib/domain/types";
import { addMonths, currentMonth, monthEnd, monthOf, monthStart, monthsBetween } from "@/lib/projects/plans";
import { BASE_CURRENCY, convert, getRates, toBase, type Rates } from "./fx";
import {
  accrue,
  buyerPay,
  defaultBuyerRate,
  defaultSmmRate,
  flatPay,
  PAY_CURRENCY,
  firstPayMonth,
  LEDGER_MONTH,
  paidState,
  TEST_SHARE,
  SMM_SETUP_RATE,
  smmPay,
  smmTaskLabel,
  type Accrual,
  type KpiState,
  type PaidState,
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
  /** How the client paid FOR this month (payments marked «за месяц»): whole fee, a half-month test, nothing. */
  paid: PaidState;
  forecast: boolean;
}

/** Where a client stands with payments. Amounts are in the terms currency and in the base one. */
export interface PayState {
  /** The last month the client has paid for; null = no payment on record. */
  lastPaid: string | null;
  /** That month was paid as a half-month test. */
  lastIsTest: boolean;
  /** Months in work up to the current one with no payment for them, at the monthly fee. */
  debt: number;
  debtBase: number;
  currency: string;
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
  /** How the client paid for a month (any month, the next one too). */
  paidFor: (month: string) => PaidState;
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
  /** Income: the money that came in this month, by the day of payment. A payment is never split between months. */
  revenue: number;
  /** The same money (kept for the tables that name it «получено»). */
  received: number;
  /** What the clients' terms give for the month: the fees + the shares. For comparison only. */
  expected: number;
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
      // A payment is «for a month» (worked out from the day it came, see payMonthByDate; it can be changed on the
      // invoice list). Everything about «paid / owes» follows from the months the client has paid for.
      const feeFor = (month: string) => (t ? (overrides.find((o) => o.month === month)?.fixAmount ?? t.fixAmount) : 0);
      const live = invoices.filter((x) => x.projectId === p.id && x.status !== "cancelled");
      const paidIn = (month: string) =>
        t ? live.filter((x) => x.status === "paid" && x.month === month).reduce((a, x) => a + invoiceIn(x, t.currency, (v, f, to) => convert(v, f, to, rates)), 0) : 0;
      // Paid ahead: some of the money for the month came before that month began.
      const paidAhead = (month: string) => live.some((x) => x.status === "paid" && x.month === month && (x.paidDate ?? x.issueDate).slice(0, 7) < month);
      const paidFor = (month: string): PaidState => paidState(paidIn(month), feeFor(month), paidAhead(month));
      const rows: ProjectFinMonth[] = hist.map((month, i) => {
        const d = data[i];
        const forecast = month === now;
        let accrual: Accrual | null = null;
        // `accrual` is what the terms give for the month — what the client is expected to pay. It is NOT the income:
        // income is the money of the month it came in (receivedBase), whole, whatever days it pays for.
        if (t && month >= t.startMonth && month >= startMonth) {
          const cur = d?.currency ?? t.currency;
          // The share is counted on what has actually happened: the client's revenue comes in rare payments, so
          // stretching a month-to-date figure to the whole month would promise money that may never come.
          const rev = d?.revenue == null ? null : convert(d.revenue, cur, t.currency, rates);
          const spend = d?.spend == null ? null : convert(d.spend, cur, t.currency, rates);
          // A month can have its own fix / % (set in «Условия по месяцам»).
          const o = overrides.find((x) => x.month === month);
          const pct = o?.sharePct ?? t.sharePct;
          accrual = accrue({ ...t, fixAmount: o?.fixAmount ?? t.fixAmount, sharePct: pct, shareBase: t.shareBase ?? (pct ? "client_profit" : null) }, rev, spend);
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
          paid: paidFor(month),
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
        paidFor,
        pay: t
          ? (() => {
              // The first month the client is billed for: a project that starts after the 7th enters the next month.
              const firstMonth = [LEDGER_MONTH, t.startMonth, firstPayMonth(p.startDate)].sort().pop()!;
              const paidMonths = [...new Set(live.filter((x) => x.status === "paid").map((x) => x.month))].sort();
              // A client pays in advance, always: the months before the first payment on record were paid for before
              // the payments were kept here — they are not a debt.
              const owedFrom = paidMonths.length && paidMonths[0] > firstMonth ? paidMonths[0] : firstMonth;
              let debt = 0;
              if (p.status === "active") for (const m of monthsBetween(monthStart(owedFrom), monthStart(now))) if (paidFor(m) === "none") debt += feeFor(m);
              const lastPaid = paidMonths.length ? paidMonths[paidMonths.length - 1] : null;
              return { lastPaid, lastIsTest: lastPaid ? paidFor(lastPaid) === "test" : false, debt, debtBase: toBase(debt, t.currency, rates), currency: t.currency };
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
        // The set-up is its own flat amount. An SMM test is not paid at all: only the media buyer is paid for a test.
        const flat = task === "setup" ? (smmRates.get(fp.id) ?? SMM_SETUP_RATE) : 0;
        pay = flatPay(states.map((x) => x.month), flat, now, task === "test" ? "Тест: без оплаты" : smmTaskLabel(task));
      }
      const add = (line: PayLine, lineTask: string) => {
        if (line.month < since || line.month < fp.startMonth) return;
        const row: PayRow = { ...line, role: job.role, task: lineTask, sources, projectId: fp.id, projectName: fp.name, amountBase: line.amount === null ? 0 : toBase(line.amount, PAY_CURRENCY, rates) };
        if (line.month === next) who.nextLines.push(row);
        else who.lines.push(row);
      };
      const half = (line: PayLine, why: string): PayLine => {
        const amount = line.rate === null ? null : Math.round(line.rate * TEST_SHARE * 100) / 100;
        return { ...line, state: "unknown", streak: 0, amount, rule: `Тест: ${why} — половина ставки` };
      };
      // Whole months only; a start after the 7th writes the first pay to the next month.
      const first = a?.startDate ? firstPayMonth(a.startDate) : null;
      const startMonth = a?.startDate ? a.startDate.slice(0, 7) : null;
      // The client took a half-month test in month T (paid a part of the fee inside T). Everyone who was on the
      // project in T is paid half the rate for it, in T itself — whatever day of T they started on.
      const tests = task === "run" ? states.map((x) => x.month).filter((m) => fp.paidFor(m) === "test") : [];
      for (const line of pay) {
        if (tests.includes(line.month)) {
          // Half the rate for the media buyer; the SMM specialist is not paid for a client's test.
          if (job.role === "media_buyer" && (!startMonth || startMonth <= line.month)) add(half(line, "клиент зашёл на полмесяца"), "stub");
        } else if (!first || line.month >= first) add(line, task);
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
    const expected = finProjects.reduce((a, p) => a + (p.months.find((m) => m.month === month)?.accrualBase ?? 0), 0);
    // Income is the money of the month it came in — every payment, with the ones not tied to a project.
    const received = invoices.filter((x) => x.status === "paid" && cashMonth(x) === month).reduce((a, x) => a + inBase(x), 0);
    const revenue = received;
    const payroll = payrollFor(month);
    const other = expensesFor(month).reduce((a, e) => a + e.amountBase, 0);
    return { month, revenue, received, expected, payroll, other, profit: revenue - payroll - other, plan: plansBy.get(month) ?? null, forecast: month === now };
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
  // The fund is what will have to be paid out: the pay is set aside the moment the client's money comes. The next
  // month is in it for every project whose client has already paid for that month — whole, at the full rate — and
  // for every half-month test (the client has paid for it by definition).
  const nextPaid = new Map(finProjects.map((p) => [p.id, p.paidFor(next) === "full"]));
  const nextPayroll = people.reduce((a, p) => a + p.nextLines.reduce((s, l) => s + (l.task === "stub" || nextPaid.get(l.projectId) ? l.amountBase : 0), 0), 0);
  const unpaidPayroll = payoutsDue.filter((d) => !d.paid).reduce((a, d) => a + toBase(d.amount, d.currency, rates), 0);
  const currentPayroll = payrollFor(now);
  const payrollFund: PayrollFund = {
    total: unpaidPayroll + currentPayroll + nextPayroll,
    unpaid: unpaidPayroll,
    current: currentPayroll,
    next: nextPayroll,
    nextMonth: next,
    nextProjects: finProjects.filter((p) => nextPaid.get(p.id) || people.some((x) => x.nextLines.some((l) => l.task === "stub" && l.projectId === p.id))).map((p) => p.name),
  };



  return {
    now,
    months,
    rates,
    projects: finProjects,
    people,
    assignments,
    expenses,
    invoices,
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
