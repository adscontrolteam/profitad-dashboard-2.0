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
    rule: rate === null ? `${label}: ставка не задана — задайте кнопкой «Ставка»` : `${label}: фиксированная ставка, KPI не влияет`,
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

/** A month is taken as this many working days: the project rate is split into day rates by it. */
export const WORKDAYS_PER_MONTH = 21;

/** Working days (Mon–Fri) from a date to the end of its month, both included. */
export function workdaysFrom(startDate: string) {
  const [y, m, d] = startDate.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let day = d; day <= last; day++) {
    const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Pay lines of a person who joined the project on `startDate`.
 * Months before the start are dropped. The month of the start is paid by working days: amount ÷ 21 × days worked
 * (never more than the full amount). Every later month is a full one. The KPI rule (−50% / +50%) is applied first,
 * so a missed month gives 75 ÷ 21 × days for a 150 rate.
 */
export function prorateEntry<T extends PayLine>(lines: T[], startDate: string | null): (T & { days: number | null })[] {
  if (!startDate) return lines.map((l) => ({ ...l, days: null }));
  const startMonth = startDate.slice(0, 7);
  return lines
    .filter((l) => l.month >= startMonth)
    .map((l) => {
      if (l.month !== startMonth) return { ...l, days: null };
      const days = workdaysFrom(startDate);
      if (days >= WORKDAYS_PER_MONTH) return { ...l, days: null };
      const from = startDate.slice(8, 10) + "." + startDate.slice(5, 7);
      return {
        ...l,
        days,
        amount: l.amount === null ? null : Math.round(((l.amount * days) / WORKDAYS_PER_MONTH) * 100) / 100,
        rule: `${l.rule} · на проекте с ${from}: ${days} раб. дн. из ${WORKDAYS_PER_MONTH}`,
      };
    });
}

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
