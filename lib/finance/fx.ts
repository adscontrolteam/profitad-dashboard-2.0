import { cacheLife } from "next/cache";
import type { Rates } from "./currency";

export * from "./currency";

/** UAH per unit; used only when the NBU API is unreachable. */
const FALLBACK: Record<string, number> = { UAH: 1, USD: 41.5, EUR: 48.2, PLN: 11.3 };

/** Official NBU rates (UAH per unit of each currency), refreshed every few hours. USDT is taken at par with USD. */
export async function getRates(): Promise<Rates> {
  "use cache";
  cacheLife("hours");
  const rates: Rates = { ...FALLBACK };
  try {
    const res = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const rows = (await res.json()) as { cc: string; rate: number }[];
      for (const r of rows) if (r.cc && r.rate > 0) rates[r.cc] = r.rate;
    }
  } catch {
    // keep fallback rates
  }
  rates.UAH = 1;
  rates.USDT = rates.USD;
  return rates;
}

