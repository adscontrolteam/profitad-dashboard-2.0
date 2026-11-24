/**
 * Service periods: which days a client's payment covers. Pure functions, no I/O.
 *
 * The iron rule of the agency: a client pays in advance. So a payment is not «for a month» typed by hand, it buys
 * a stretch of days — and everything else follows from those days: what is earned in a month, who is paid up and
 * until when, who owes, when the next invoice is due, how much payroll the clients have already paid for.
 *
 * A period is either typed on the invoice (periodStart / periodEnd) or worked out here from the dates:
 *   — it continues the previous paid period when there is one;
 *   — else a payment in the first days of a month is for that month, one in its last days is for the next month,
 *     one in the middle starts on the day it was made (or on the project's start, if that is still ahead);
 *   — a full monthly fee buys a month (a calendar one from the 1st, else day-to-day), a part of the fee buys the
 *     rest of the current month.
 */

/** Payments are kept in the dashboard from this day; nothing before it is counted as owed. */
export const LEDGER_START = "2026-11-01";

/** A payment up to this day of a month is for that month; from EARLY+1 to LATE-1 it starts on its own day. */
const EARLY_DAY = 10;
const LATE_DAY = 20;

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => iso(new Date(utc(day).getTime() + n * 86_400_000));
export const monthOfDay = (day: string) => day.slice(0, 7);
export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const firstOf = (month: string) => `${month}-01`;
export const lastOf = (month: string) => `${month}-${String(daysIn(month)).padStart(2, "0")}`;
export const shiftMonth = (month: string, n: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return iso(d).slice(0, 7);
};
/** The same day of the month n months later (the 31st becomes the last day of a shorter month). */
export function sameDayLater(day: string, n: number) {
  const month = shiftMonth(monthOfDay(day), n);
  return `${month}-${String(Math.min(Number(day.slice(8, 10)), daysIn(month))).padStart(2, "0")}`;
}
export const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1;
const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

export interface PeriodInput {
  id: string;
  /** The day the money came (paid) or the invoice is dated (issued). */
  date: string;
  paid: boolean;
  /** Amount in the currency of the client's terms. */
  amount: number;
  /** Typed on the invoice; null = work it out. */
  periodStart: string | null;
  periodEnd: string | null;
}

export interface Period {
  id: string;
  /** The day of the payment or of the invoice. */
  date: string;
  start: string;
  end: string;
  paid: boolean;
  /** Worked out from the dates, not typed. */
  auto: boolean;
}

/** How many whole monthly fees an amount is: 1, 2, 3… when it is within 10% of that; 0 = a part of one fee. */
export function feesIn(amount: number, fee: number) {
  if (fee <= 0) return 1;
  const ratio = amount / fee;
  if (ratio < 0.9) return 0;
  const k = Math.round(ratio);
  // A full fee with extras on top (a site, a one-off task) is still one month of service.
  return Math.abs(ratio - k) <= 0.1 * k ? k : 1;
}

/** Where a payment made on `date` starts when nothing is typed and no paid period runs into it. */
export function startByDate(date: string, projectStart: string) {
  if (projectStart > date) return projectStart;
  const day = Number(date.slice(8, 10));
  if (day <= EARLY_DAY) return firstOf(monthOfDay(date));
  if (day >= LATE_DAY) return firstOf(shiftMonth(monthOfDay(date), 1));
  return date;
}

/** The last day a payment starting on `start` covers. */
export function endFor(start: string, amount: number, fee: number) {
  const k = feesIn(amount, fee);
  const month = monthOfDay(start);
  const first = start === firstOf(month);
  if (k === 0) {
    // A part of the fee: the rest of the month; paid on the 1st — that share of the month's days.
    if (!first) return lastOf(month);
    const days = Math.max(1, Math.round((amount / fee) * daysIn(month)));
    return addDays(start, days - 1);
  }
  return first ? lastOf(shiftMonth(month, k - 1)) : addDays(sameDayLater(start, k), -1);
}

/**
 * Periods of a project's invoices and payments, oldest first. `feeFor(month)` is the monthly fee of that month in
 * the terms currency; `projectStart` is the day the work starts.
 */
export function resolvePeriods(items: PeriodInput[], feeFor: (month: string) => number, projectStart: string): Period[] {
  const out: Period[] = [];
  let through: string | null = null;
  for (const it of [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    let start = it.periodStart;
    if (!start) {
      // Continues the previous period when that one still runs, or ended not long before this payment.
      const next: string | null = through ? addDays(through, 1) : null;
      start = next && next >= firstOf(monthOfDay(it.date)) ? next : startByDate(it.date, projectStart);
    }
    let end = it.periodEnd;
    if (!end || end < start) end = endFor(start, it.amount, feeFor(monthOfDay(start)));
    out.push({ id: it.id, date: it.date, start, end, paid: it.paid, auto: !it.periodStart || !it.periodEnd });
    if (!through || end > through) through = end;
  }
  return out;
}

/** Days of [from, to] covered by paid periods. */
export function coveredDays(periods: Period[], from: string, to: string) {
  if (to < from) return 0;
  // Overlapping periods must not count a day twice: walk the merged stretches.
  const paid = periods.filter((p) => p.paid).sort((a, b) => (a.start < b.start ? -1 : 1));
  let n = 0;
  let cursor = from;
  for (const p of paid) {
    const a = later(p.start, cursor);
    const b = earlier(p.end, to);
    if (b < a) continue;
    n += daysBetween(a, b);
    cursor = addDays(b, 1);
    if (cursor > to) break;
  }
  return n;
}

export const paidThrough = (periods: Period[]) => periods.filter((p) => p.paid).reduce<string | null>((a, p) => (!a || p.end > a ? p.end : a), null);

/**
 * The day the client starts to be billed: the start of the work, not earlier than the ledger.
 * A client pays in advance, so when the first payment on record starts its period in the month it was made in,
 * the service starts with that payment (a project begun in the middle of a month). A first payment made for the
 * NEXT month means the client was already in service before it — then the earlier days stay billable.
 */
export function billableStart(periods: Period[], projectStart: string, termsStart: string) {
  const base = [LEDGER_START, projectStart, termsStart].reduce(later);
  const first = periods.reduce<Period | null>((a, p) => (!a || p.start < a.start ? p : a), null);
  if (!first || first.start <= base) return base;
  return first.start <= lastOf(monthOfDay(first.date)) ? first.start : base;
}

/** Days of a month the client is in service: from the billable start to the month's end. */
export function serviceDays(month: string, from: string) {
  const a = later(firstOf(month), from);
  const b = lastOf(month);
  return b < a ? 0 : daysBetween(a, b);
}

/** Value of the days of [from, to] by the monthly fee, counted by calendar days; `only` picks the days to count. */
function valueOf(from: string, to: string, feeFor: (month: string) => number, count: (a: string, b: string) => number) {
  let total = 0;
  for (let month = monthOfDay(from); month <= monthOfDay(to); month = shiftMonth(month, 1)) {
    const a = later(firstOf(month), from);
    const b = earlier(lastOf(month), to);
    if (b < a) continue;
    total += (feeFor(month) * count(a, b)) / daysIn(month);
  }
  return total;
}

/** What the client owes today: the days in service up to today that no payment covers, at the monthly fee. */
export function debtOn(today: string, periods: Period[], from: string, feeFor: (month: string) => number) {
  if (today < from) return 0;
  return valueOf(from, today, feeFor, (a, b) => daysBetween(a, b) - coveredDays(periods, a, b));
}

/** What the client has paid ahead: the covered days after today, at the monthly fee. */
export function prepaidOn(today: string, periods: Period[], feeFor: (month: string) => number) {
  const through = paidThrough(periods);
  const from = addDays(today, 1);
  if (!through || through < from) return 0;
  return valueOf(from, through, feeFor, (a, b) => coveredDays(periods, a, b));
}

/**
 * The next period to invoice: it starts the day after everything already invoiced or paid, and runs a calendar
 * month when it starts on the 1st, else day-to-day.
 */
export function nextPeriod(periods: Period[], from: string): { start: string; end: string } {
  const through = periods.reduce<string | null>((a, p) => (!a || p.end > a ? p.end : a), null);
  const start = through && addDays(through, 1) > from ? addDays(through, 1) : from;
  const month = monthOfDay(start);
  return { start, end: start === firstOf(month) ? lastOf(month) : addDays(sameDayLater(start, 1), -1) };
}

/** The day the invoice for a period appears: the 25th of the month before for a calendar month, else a week ahead. */
export function invoiceDay(periodStart: string) {
  const month = monthOfDay(periodStart);
  return periodStart === firstOf(month) ? `${shiftMonth(month, -1)}-25` : addDays(periodStart, -7);
}
