import { cacheLife, cacheTag } from "next/cache";
import { getProjects } from "@/lib/data";
import { dbSource } from "@/lib/data/sources/db";
import { TAGS } from "@/lib/data/tags";
import { computeStats } from "@/lib/domain/stats";
import type { ResultMetric } from "@/lib/domain/types";
import { addMonths, currentMonth, monthEnd, monthOf, monthStart, monthsBetween } from "@/lib/projects/plans";
import { BASE_CURRENCY, convert, getRates, toBase, type Rates } from "./fx";
import { accrue, buyerPay, defaultBuyerRate, PAY_CURRENCY, type Accrual, type KpiState, type PayLine, type Terms } from "./rules";
import {
  invoiceIn,
  listBuyerRates,
  listExpenses,
  listInvoices,
  listMonthTerms,
  listPayouts,
  listPlans,
  listStaff,
  listTerms,
  type AgencyPlan,
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
  /** Media buyer's rate for the project, USD; null = not set yet (2+ traffic sources). */
  buyerRate: number | null;
  startMonth: string;
  terms: Terms | null;
  /** Months whose terms differ from the usual ones. */
  overrides: MonthTerms[];
  months: ProjectFinMonth[];
}

export interface PayRow extends PayLine {
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

export interface FinanceReport {
  now: string;
  months: string[];
  rates: Rates;
  projects: ProjectFin[];
  people: PersonPay[];
  expenses: Expense[];
  invoices: Invoice[];
  plans: AgencyPlan[];
  pnl: PnlMonth[];
  payoutsDue: PayoutDue[];
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
  const [allProjects, terms, invoices, expenses, staff, payouts, plans, rates, buyerRates, monthTerms] = await Promise.all([
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
          const scale = forecast && d && d.elapsed > 0 ? 1 / d.elapsed : 1;
          const rev = d?.revenue == null ? null : convert(d.revenue * scale, cur, t.currency, rates);
          const spend = d?.spend == null ? null : convert(d.spend * scale, cur, t.currency, rates);
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
        buyerRate: buyerRates.get(p.id) ?? t?.buyerRate ?? defaultBuyerRate(p.sources.length),
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
    if (!fp.mediaBuyerEmail || fp.status === "archived") continue;
    const who = person(fp.mediaBuyerEmail, "media_buyer");
    if (who.staff?.active === false) continue;
    const since = who.staff?.sinceMonth ?? now;
    const rate = fp.buyerRate;
    const pay = buyerPay(fp.months.map((m) => ({ month: m.month, state: m.kpi })), rate, now);
    for (const line of pay) {
      if (line.month < since || line.month < fp.startMonth) continue;
      who.lines.push({ ...line, projectId: fp.id, projectName: fp.name, amountBase: line.amount === null ? 0 : toBase(line.amount, PAY_CURRENCY, rates) });
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

  return { now, months, rates, projects: finProjects, people, expenses, invoices, plans, pnl, payoutsDue, expensesFor, payrollFor };
}

export { BASE_CURRENCY };
