import { cacheLife, cacheTag } from "next/cache";
import { getProjects } from "@/lib/data";
import { dbSource } from "@/lib/data/sources/db";
import { TAGS } from "@/lib/data/tags";
import { computeStats } from "@/lib/domain/stats";
import type { ResultMetric } from "@/lib/domain/types";
import { addMonths, currentMonth, monthEnd, monthOf, monthStart, monthsBetween } from "@/lib/projects/plans";
import { BASE_CURRENCY, convert, getRates, toBase, type Rates } from "./fx";
import { accrue, buyerPay, defaultBuyerRate, defaultSmmRate, PAY_CURRENCY, prorateEntry, smmPay, type Accrual, type KpiState, type PayLine, type Terms } from "./rules";
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
  /** Paid invoices for this month, base currency. */
  receivedBase: number;
  /** Issued and not yet paid, base currency. */
  issuedBase: number;
  forecast: boolean;
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
  amount: number;
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
  plans: AgencyPlan[];
  pnl: PnlMonth[];
  payoutsDue: PayoutDue[];
  payrollFund: PayrollFund;
  expensesFor: (month: string) => ExpenseLine[];
  payrollFor: (month: string) => number;
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
      const rows: ProjectFinMonth[] = hist.map((month, i) => {
        const d = data[i];
        const forecast = month === now;
        let accrual: Accrual | null = null;
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
        const inv = invoices.filter((x) => x.projectId === p.id && x.month === month && x.status !== "cancelled");
        return {
          month,
          data: d,
          kpi: kpiState(d, forecast),
          accrual,
          accrualBase: accrual ? toBase(accrual.total, accrual.currency, rates) : 0,
          receivedBase: inv.filter((x) => x.status === "paid").reduce((a, x) => a + inBase(x), 0),
          issuedBase: inv.filter((x) => x.status === "issued").reduce((a, x) => a + inBase(x), 0),
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
  const staffBy = new Map(staff.map((s) => [s.email, s]));
  const peopleBy = new Map<string, PersonPay>();
  const person = (email: string, role: string): PersonPay => {
    let p = peopleBy.get(email);
    if (!p) {
      const s = staffBy.get(email) ?? null;
      p = { email, name: s?.name || nameFromEmail(email), role: s?.role ?? role, staff: s, baseSalary: s?.active === false ? 0 : (s?.baseSalary ?? 0), currency: s?.currency ?? PAY_CURRENCY, lines: [] };
      peopleBy.set(email, p);
    }
    return p;
  };
  for (const s of staff) if (s.active) person(s.email, s.role);
  for (const fp of finProjects) {
    if (fp.status === "archived") continue;
    const states = fp.months.map((m) => ({ month: m.month, state: m.kpi }));
    // The same project pays its media buyer and its SMM specialist, each by their own rate.
    const jobs = [
      { role: "media_buyer" as const, email: fp.mediaBuyerEmail, pay: () => buyerPay(states, fp.buyerRate, now) },
      { role: "smm" as const, email: fp.smmEmail, pay: () => smmPay(states, fp.smmRate, now) },
    ];
    for (const job of jobs) {
      if (!job.email) continue;
      const who = person(job.email, job.role);
      if (who.staff?.active === false) continue;
      const since = who.staff?.sinceMonth ?? now;
      // Joined the project in the middle of a month → that month is paid by working days, later ones in full.
      const joined = assignments.find((a) => a.projectId === fp.id && a.email === job.email!.toLowerCase() && a.role === job.role);
      for (const line of prorateEntry(job.pay(), joined?.startDate ?? null)) {
        if (line.month < since || line.month < fp.startMonth) continue;
        who.lines.push({ ...line, role: job.role, projectId: fp.id, projectName: fp.name, amountBase: line.amount === null ? 0 : toBase(line.amount, PAY_CURRENCY, rates) });
      }
    }
  }
  const people = [...peopleBy.values()];
  const baseSalaryFor = (p: PersonPay, month: string) =>
    p.baseSalary > 0 && (!p.staff || p.staff.sinceMonth <= month) ? p.baseSalary : 0;
  const payrollFor = (month: string) =>
    people.reduce(
      (a, p) => a + p.lines.filter((l) => l.month === month).reduce((s, l) => s + l.amountBase, 0) + toBase(baseSalaryFor(p, month), p.currency, rates),
      0,
    );

  const expensesFor = (month: string): ExpenseLine[] =>
    expenses.filter((e) => expenseActive(e, month)).map((e) => ({ expense: e, amountBase: toBase(e.amount, e.currency, rates) }));

  /* ---- P&L ---- */
  const plansBy = new Map(plans.map((p) => [p.month, p]));
  const pnl: PnlMonth[] = months.map((month) => {
    const revenue = finProjects.reduce((a, p) => a + (p.months.find((m) => m.month === month)?.accrualBase ?? 0), 0);
    const received = finProjects.reduce((a, p) => a + (p.months.find((m) => m.month === month)?.receivedBase ?? 0), 0);
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
      const amount = lines.reduce((a, l) => a + (l.amount ?? 0), 0) + baseSalary;
      return {
        email: p.email,
        name: p.name,
        month: prev,
        amount,
        currency: PAY_CURRENCY,
        lines,
        baseSalary,
        paid: payouts.find((x) => x.email === p.email && x.month === prev) ?? null,
      };
    })
    .filter((d) => d.amount > 0 || d.lines.length);

  /* ---- payroll fund: what is already owed + what the clients have paid ahead for ---- */
  const next = addMonths(now, 1);
  const paidAhead = new Set(
    invoices.filter((x) => x.projectId && x.month === next && x.status === "paid").map((x) => x.projectId as string),
  );
  const nextPayroll = people.reduce(
    (a, p) =>
      a +
      p.lines
        .filter((l) => l.month === now && paidAhead.has(l.projectId) && l.rate !== null)
        // A full month at the rate; the third month in a row with KPI met is already +50%.
        .reduce((s, l) => s + toBase(l.rate! * (l.streak + 1 >= 3 ? 1.5 : 1), PAY_CURRENCY, rates), 0),
    0,
  );
  const unpaidPayroll = payoutsDue.filter((d) => !d.paid).reduce((a, d) => a + toBase(d.amount, d.currency, rates), 0);
  const currentPayroll = payrollFor(now);
  const payrollFund: PayrollFund = {
    total: unpaidPayroll + currentPayroll + nextPayroll,
    unpaid: unpaidPayroll,
    current: currentPayroll,
    next: nextPayroll,
    nextMonth: next,
    nextProjects: finProjects.filter((p) => paidAhead.has(p.id) && people.some((x) => x.lines.some((l) => l.month === now && l.projectId === p.id))).map((p) => p.name),
  };

  return { now, months, rates, projects: finProjects, people, assignments, expenses, invoices, plans, pnl, payoutsDue, payrollFund, expensesFor, payrollFor };
}

export { BASE_CURRENCY };
