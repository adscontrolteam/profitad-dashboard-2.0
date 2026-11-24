/** Rules of the agency's money: client terms and the media buyer's pay. Pure functions, no I/O. */

export type ShareBase = "client_profit" | "client_revenue" | "ad_spend";

export const SHARE_BASES: { value: ShareBase; label: string; hint: string }[] = [
  { value: "client_profit", label: "Доход клиента − рекл. бюджет − фикс", hint: "X = доход − расход на рекламу − фикс; X < 0 → только фикс" },
  { value: "client_revenue", label: "Доход клиента", hint: "% от дохода клиента с рекламы" },
  { value: "ad_spend", label: "Рекламный бюджет", hint: "% от расхода на рекламу" },
];

export interface Terms {
  projectId: string;
  fixAmount: number;
  currency: string;
  sharePct: number | null;
  shareBase: ShareBase | null;
  buyerRate: number | null;
  payDay: number | null;
  startMonth: string;
  note: string;
}

export interface Accrual {
  fix: number;
  share: number;
  total: number;
  /** The share base value (e.g. X for Lex Dixit), in terms currency. */
  base: number | null;
  currency: string;
}

/** Revenue of a month by the client's terms. revenue/spend are in terms currency (already converted). */
export function accrue(terms: Terms, revenue: number | null, spend: number | null): Accrual {
  const fix = terms.fixAmount;
  if (!terms.sharePct || !terms.shareBase) return { fix, share: 0, total: fix, base: null, currency: terms.currency };
  let base: number | null = null;
  if (terms.shareBase === "client_profit") base = revenue === null ? null : revenue - (spend ?? 0) - fix;
  if (terms.shareBase === "client_revenue") base = revenue;
  if (terms.shareBase === "ad_spend") base = spend;
  const share = base !== null && base > 0 ? (base * terms.sharePct) / 100 : 0;
  return { fix, share, total: fix + share, base, currency: terms.currency };
}

/* ---------------- Media buyer pay ---------------- */

/** Rate per project by the number of traffic sources, USD. Three and more sources — set per project by hand. */
export const BUYER_RATE_ONE_SOURCE = 150;
export const BUYER_RATE_TWO_SOURCES = 225;
export const PAY_CURRENCY = "USD";

export type KpiState = "met" | "missed" | "unknown";

export interface PayLine {
  month: string;
  state: KpiState;
  /** Consecutive months with KPI met, ending at this month. */
  streak: number;
  rate: number | null;
  amount: number | null;
  rule: string;
  /** The current month: KPI is assumed met (full rate) for the forecast. */
  forecast: boolean;
}

/* ---------------- SMM pay ---------------- */

/** Monthly rate for running a project's social networks, USD: one network, two, three and more. */
export const SMM_RATES = { one: 120, two: 150, many: 200 } as const;
/** Setting up the social networks before running them: a one-off task of 2–3 weeks, set by hand as the rate. */
export const SMM_SETUP_RATE = 100;

/** What an SMM specialist does on a project. */
export type SmmTask = "run" | "setup" | "test";
export const SMM_TASKS: { value: SmmTask; label: string }[] = [
  { value: "run", label: "Ведение" },
  { value: "setup", label: "Оформление" },
  { value: "test", label: "Тест" },
];
export const smmTaskLabel = (t: string | null | undefined) => SMM_TASKS.find((x) => x.value === t)?.label ?? "Ведение";

/**
 * A task paid by a flat amount a month: the set-up of social networks, a test. No KPI rule — neither −50% nor +50%.
 */
export function flatPay(months: string[], rate: number | null, currentMonth: string, label: string): PayLine[] {
  return months.map((month) => ({
    month,
    state: "unknown" as const,
    streak: 0,
    rate,
    amount: rate,
    rule: rate === null ? `${label}: ставка не задана — задайте кнопкой «Ставка»` : `${label}, KPI не влияет`,
    forecast: month === currentMonth,
  }));
}

/** A full next month by the line of the current one: KPI is taken as met, the third month in a row is already +50%. */
export function nextMonthAmount(line: Pick<PayLine, "rate" | "streak">, flat: boolean) {
  if (line.rate === null) return 0;
  return flat ? line.rate : line.rate * (line.streak + 1 >= 3 ? 1.5 : 1);
}

/** Rate by the number of social networks run for the project; none connected → not known, set by hand. */
export function defaultSmmRate(networks: number) {
  if (networks <= 0) return null;
  return networks === 1 ? SMM_RATES.one : networks === 2 ? SMM_RATES.two : SMM_RATES.many;
}

/**
 * SMM pay by month. The rule is the media buyer's one on another rate: KPI missed → 50%; KPI met → 100%;
 * from the 3rd month in a row with KPI met (the client stays with us) → 150% while it lasts.
 */
export const smmPay = (states: { month: string; state: KpiState }[], rate: number | null, currentMonth: string) =>
  buyerPay(states, rate, currentMonth, "Ставка не задана: соцсети проекта не подключены");

/**
 * A project is paid by whole months — no day rates.
 * A person who starts on a project up to this day of a month has that month as a full one. A later start writes
 * the first pay to the NEXT month: the rest of the starting month is not paid apart, the project «enters» the next
 * month as a full one.
 */
export const ENTRY_DAY = 7;

/** The first month a person is paid for on a project they started on `startDate`. */
export function firstPayMonth(startDate: string) {
  const month = startDate.slice(0, 7);
  if (Number(startDate.slice(8, 10)) <= ENTRY_DAY) return month;
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  return d.toISOString().slice(0, 7);
}

/** Pay lines of a person who joined the project on `startDate`: whole months from the first paid one. */
export function fromEntry<T extends PayLine>(lines: T[], startDate: string | null): T[] {
  if (!startDate) return lines;
  const first = firstPayMonth(startDate);
  return lines.filter((l) => l.month >= first);
}

/**
 * The month a client's payment is for, by the day it came: the agency is always paid in advance, so money that comes
 * after the 7th is for the next month. A part of the fee is a test of the current month — it stays in it.
 */
export function payMonthByDate(date: string, partial = false) {
  return partial ? date.slice(0, 7) : firstPayMonth(date);
}

/** Payments are kept in the dashboard from this month; nothing before it is counted as owed. */
export const LEDGER_MONTH = "2026-11";

/** How a client paid for a month: the whole fee, a part of it (a test for half a month), or nothing. */
export type PaidState = "full" | "test" | "none";

export function paidState(paid: number, fee: number): PaidState {
  if (paid <= 0) return "none";
  return fee <= 0 || paid >= fee * 0.9 ? "full" : "test";
}

/** A test (a client taken for half a month, an SMM test task) is paid half the rate; the KPI rule does not touch it. */
export const TEST_SHARE = 0.5;

export function defaultBuyerRate(sourcesCount: number) {
  if (sourcesCount <= 1) return BUYER_RATE_ONE_SOURCE;
  return sourcesCount === 2 ? BUYER_RATE_TWO_SOURCES : null;
}

/**
 * Pay for each month, oldest first.
 * KPI missed → 50% of the rate. KPI met → 100%; from the 3rd month in a row with KPI met → 150%, every month
 * while KPI keeps being met. A miss resets the count. The current month is forecast as met (full rate).
 */
export function buyerPay(
  states: { month: string; state: KpiState }[],
  rate: number | null,
  currentMonth: string,
  noRate = "Ставка не задана (3+ источника трафика)",
): PayLine[] {
  let streak = 0;
  return states.map(({ month, state }) => {
    const forecast = month === currentMonth;
    const effective: KpiState = forecast ? "met" : state;
    streak = effective === "met" ? streak + 1 : 0;
    let amount: number | null = null;
    let rule = "";
    if (rate === null) rule = noRate;
    else if (effective === "missed") {
      amount = rate * 0.5;
      rule = "KPI не выполнен: −50%";
    } else if (effective === "unknown") {
      amount = rate;
      rule = "Нет плана или данных KPI: базовая ставка";
    } else if (streak >= 3) {
      amount = rate * 1.5;
      rule = `KPI ${streak}-й месяц подряд: +50%`;
    } else {
      amount = rate;
      rule = forecast ? "Прогноз: KPI выполнен, полная ставка" : `KPI выполнен (${streak}-й месяц подряд)`;
    }
    if (forecast && streak >= 3 && rate !== null) rule = `Прогноз: KPI ${streak}-й месяц подряд, +50%`;
    return { month, state, streak, rate, amount, rule, forecast };
  });
}
