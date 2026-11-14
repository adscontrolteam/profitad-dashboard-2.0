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

/** Rate per project for one traffic source, USD. Two and more sources — a different rate (set per project). */
export const BUYER_RATE_ONE_SOURCE = 150;
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

export function defaultBuyerRate(sourcesCount: number) {
  return sourcesCount <= 1 ? BUYER_RATE_ONE_SOURCE : null;
}

/**
 * Pay for each month, oldest first.
 * KPI missed → 50% of the rate. KPI met → 100%; from the 3rd month in a row with KPI met → 150%, every month
 * while KPI keeps being met. A miss resets the count. The current month is forecast as met (full rate).
 */
export function buyerPay(states: { month: string; state: KpiState }[], rate: number | null, currentMonth: string): PayLine[] {
  let streak = 0;
  return states.map(({ month, state }) => {
    const forecast = month === currentMonth;
    const effective: KpiState = forecast ? "met" : state;
    streak = effective === "met" ? streak + 1 : 0;
    let amount: number | null = null;
    let rule = "";
    if (rate === null) rule = "Ставка не задана (2+ источника трафика)";
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
