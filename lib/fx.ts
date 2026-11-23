import "server-only";

/**
 * Today's official exchange rates of the National Bank of Ukraine (UAH per unit), fetched once per hour per instance.
 * Used to bring a client's sales in one currency to the currency of the ad account.
 */
let cache: { at: number; uahPer: Record<string, number>; date: string } | null = null;

async function rates() {
  if (cache && Date.now() - cache.at < 3_600_000) return cache;
  const res = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Курс НБУ недоступен (${res.status})`);
  const list = (await res.json()) as { cc: string; rate: number; exchangedate: string }[];
  const uahPer: Record<string, number> = { UAH: 1 };
  for (const r of list) if (r.rate > 0) uahPer[r.cc] = r.rate;
  cache = { at: Date.now(), uahPer, date: list[0]?.exchangedate ?? "" };
  return cache;
}

/** How many units of `to` one unit of `from` is worth today. */
export async function fxRate(from: string, to: string): Promise<{ rate: number; date: string }> {
  if (from === to) return { rate: 1, date: "" };
  const r = await rates();
  const a = r.uahPer[from], b = r.uahPer[to];
  if (!a || !b) throw new Error(`Нет курса ${from} → ${to} у НБУ`);
  return { rate: a / b, date: r.date };
}
