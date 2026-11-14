/** Currency helpers safe for client components (no server APIs). */
/** Everything in Financial is summed in this currency. */
export const BASE_CURRENCY = "USD";

export const CURRENCIES = ["USD", "EUR", "UAH", "PLN", "USDT"] as const;

export type Rates = Record<string, number>;

export function convert(amount: number, from: string, to: string, rates: Rates) {
  const f = rates[from.toUpperCase()];
  const t = rates[to.toUpperCase()];
  if (!f || !t || from === to) return amount;
  return (amount * f) / t;
}

export const toBase = (amount: number, from: string, rates: Rates) => convert(amount, from, BASE_CURRENCY, rates);

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", UAH: "₴", PLN: "zł", USDT: "USDT" };

export function money(value: number | null | undefined, currency = BASE_CURRENCY, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const n = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const s = SYMBOLS[currency] ?? currency;
  return currency === "USD" || currency === "EUR" ? `${value < 0 ? "−" : ""}${s}${n.replace("-", "")}` : `${n} ${s}`;
}
