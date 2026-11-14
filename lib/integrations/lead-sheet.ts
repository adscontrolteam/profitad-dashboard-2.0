import { createHash } from "node:crypto";
import type { LeadOutcome, NormalizedLead, NormalizedSale } from "./types";

/**
 * Parsing of lead and sales sheets kept by hand by clients (pure functions, no I/O).
 * Headers are matched by name, statuses are free text in Russian/Ukrainian/English.
 */

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const hash = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

const HEADERS = {
  date: ["дата", "date", "created", "created_at", "время", "дата заявки"],
  name: ["имя", "ім'я", "імя", "name", "фио", "клиент", "клієнт"],
  phone: ["телефон", "phone", "тел", "номер", "contact", "контакт"],
  email: ["email", "e-mail", "почта", "пошта"],
  status: ["qualification", "квалификация", "кваліфікація", "результат", "статус", "status", "этап", "етап"],
  campaign: ["кампания", "кампанія", "campaign", "utm_campaign"],
  adgroup: ["группа", "група", "adgroup", "ad group"],
  keyword: ["ключевое слово", "ключове слово", "keyword", "utm_term"],
  gclid: ["gclid"],
  page: ["страница", "сторінка", "page", "landing", "landing_path"],
  channel: ["channel", "канал", "источник", "джерело", "source"],
  attribution: ["attribution", "атрибуция", "атрибуція", "utm"],
  message: ["message", "сообщение", "повідомлення", "вопрос", "питання", "комментарий", "коментар"],
  value: ["сумма", "сума", "сумма eur", "сума eur", "сумма оплаты", "сума оплати", "value", "amount", "чек"],
  /** A form answer kept for context (e.g. «Статус: Автономо» next to a real «Qualification» column). */
  topic: ["статус", "status", "тип", "услуга", "послуга"],
  paidAt: ["дата оплаты", "дата оплати", "оплачено", "payment date", "paid at", "paid_at"],
} as const;
type Field = keyof typeof HEADERS;

/** Free-text status → outcome. null = the text says nothing about the lead's fate. Order matters. */
const OUTCOME_RULES: [LeadOutcome, RegExp][] = [
  ["junk", /спам|spam|нецільов|нецелев|неправильн|^реклама|не наша спец|не маємо такого|не имеем такого|^тест|^test/],
  ["won", /оплатив|оплатила|оплатил|оплачен|оплата|продаж|купив|купил|домовились про співпрацю|договорились о сотруднич|\bwon\b|успешн/],
  ["no_answer", /не відповіда|не отвеча|не дозвон|не додзвон|не міг зв|не могли связ|не можем связ|недоступ|no answer|не бере трубк|не берет трубк/],
  ["lost", /не актуальн|неактуальн|не має можливост|нет возможност|відмінив|відмінила|отменил|відклав|отложил|не зможе|не сможет|не знайшли|не нашли|отказ|відмов|\blost\b|можливо звернеться|возможно обратится|має отримати|спершу|сначала долж/],
  ["qualified", /чекаю|ждём|ждем|комерційн|коммерческ|в роботі|в работе|квалиф|переговор|назначен|записан|зустріч|встреча/],
];

export function classifyStatus(status: string): LeadOutcome | null {
  const s = norm(status);
  if (!s) return null;
  for (const [outcome, re] of OUTCOME_RULES) if (re.test(s)) return outcome;
  return null;
}

/** «20.06.2026», «21.06.26», «10.11.2026 20:06», «2026-11-10», «09.10.2026 19:58:53». Times are taken as UTC. */
export function parseSheetDate(v: string): Date | null {
  const s = (v ?? "").trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** «glick: Cj0…;\nutm_source: google;…» → keys normalized (their template has typos: glick, utm_meduim, utm_compaign, refferer). */
export function parseAttribution(text: string): Record<string, string> {
  const fix: Record<string, string> = { glick: "gclid", utm_meduim: "utm_medium", utm_compaign: "utm_campaign", refferer: "referrer" };
  const out: Record<string, string> = {};
  for (const part of (text ?? "").split(/[;\n]+/)) {
    const m = part.match(/^\s*([\w-]+)\s*[:=]\s*(.*?)\s*$/);
    if (!m || !m[2]) continue;
    const key = fix[m[1].toLowerCase()] ?? m[1].toLowerCase();
    out[key] = m[2];
  }
  return out;
}

export function parseMoney(v: string): number {
  let s = (v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma > -1) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const isTest = (...parts: string[]) => parts.some((p) => /(^|[^\p{L}])(тест|test)([^\p{L}]|$)/iu.test(p ?? ""));

export interface ParsedTab {
  leads: NormalizedLead[];
  columns: Field[];
  skipped: number;
}

/** One lead per row. `tab` goes into raw so a lead can be traced back. */
export function parseLeadRows(tab: string, values: string[][]): ParsedTab {
  const [header = [], ...rows] = values;
  const idx = Object.fromEntries(
    // Names are in priority order: «Qualification» wins over a «Статус» column that holds a form answer.
    (Object.keys(HEADERS) as Field[]).map((f) => [
      f,
      (HEADERS[f] as readonly string[]).map((name) => header.findIndex((h) => norm(h) === name)).find((i) => i >= 0) ?? -1,
    ]),
  ) as Record<Field, number>;
  const cell = (row: string[], f: Field) => (idx[f] >= 0 ? (row[idx[f]] ?? "").trim() : "");
  const payCols = paymentColumns(header);

  // A «Статус» column that never says anything about the lead's fate is a form answer (e.g. «Автономо»), not a status.
  const statusIsOutcome = idx.status >= 0 && rows.some((r) => classifyStatus(cell(r, "status")) !== null);

  let skipped = 0;
  const leads: NormalizedLead[] = [];
  for (const row of rows) {
    if (!row.some((v) => (v ?? "").trim())) continue;
    const name = cell(row, "name");
    const phone = cell(row, "phone");
    const attr = parseAttribution(cell(row, "attribution"));
    const gclid = cell(row, "gclid") || attr.gclid || "";
    const leadAt = parseSheetDate(cell(row, "date"));
    if (!leadAt || isTest(name, phone, gclid)) {
      skipped++;
      continue;
    }
    const status = statusIsOutcome ? cell(row, "status") : "";
    const payments = payCols
      .map((c) => ({ date: c.date >= 0 ? (parseSheetDate(row[c.date] ?? "")?.toISOString().slice(0, 10) ?? "") : "", amount: c.amount >= 0 ? parseMoney(row[c.amount] ?? "") : 0 }))
      .filter((p) => p.date || p.amount > 0);
    const value = payments.reduce((a, p) => a + p.amount, 0);
    const utm: Record<string, string> = Object.fromEntries(
      Object.entries({
        ...attr,
        gclid,
        utm_campaign: attr.utm_campaign || cell(row, "campaign"),
        adgroup: cell(row, "adgroup"),
        utm_term: attr.utm_term || cell(row, "keyword"),
        landing_path: attr.landing_path || cell(row, "page"),
        channel: cell(row, "channel"),
        topic: idx.topic >= 0 && idx.topic !== idx.status ? cell(row, "topic") : statusIsOutcome ? "" : cell(row, "status"),
        // Paid later than the lead came in: revenue goes to the payment date, conversion to the lead's month.
        paid_at: payments.find((p) => p.date)?.date ?? "",
        tab,
      }).filter(([, v]) => v),
    );
    const fromGoogle = Boolean(utm.gclid || utm.gbraid || utm.wbraid || /google/i.test(utm.utm_source ?? ""));
    if (fromGoogle) utm.ad = "google";
    else if (/facebook|instagram|meta|\bfb\b|\big\b/i.test(utm.utm_source ?? "")) utm.ad = "meta";
    leads.push({
      externalId: "",
      leadAt,
      name,
      phone,
      email: cell(row, "email"),
      status,
      outcome: classifyStatus(status) ?? (payments.length ? "won" : "new"),
      value: value > 0 ? value : null,
      campaign: utm.utm_campaign ?? "",
      utm,
      raw: { tab, message: cell(row, "message").slice(0, 500), payments },
    });
  }
  return { leads, columns: (Object.keys(idx) as Field[]).filter((f) => idx[f] >= 0), skipped };
}

export interface Payment {
  /** YYYY-MM-DD, may be empty when only the amount is filled. */
  date: string;
  amount: number;
}

/**
 * Payment column pairs: «Дата оплати» + «Сума EUR», «Дата оплати 2» + «Сума EUR 2», … A lead can pay several times
 * (consultation now, a service a month later); each payment counts in its own month.
 */
function paymentColumns(header: string[]) {
  const pairs = new Map<number, { date: number; amount: number }>();
  header.forEach((h, i) => {
    const t = norm(h);
    const d = t.match(/^(?:дата оплаты|дата оплати|payment date|paid at|paid_at)\s*(\d*)$/);
    const a = t.match(/^(?:сумма|сума|value|amount)(?: оплаты| оплати)?(?: eur| usd| pln|, eur)?\s*(\d*)$/);
    const m = d ?? a;
    if (!m) return;
    const n = Number(m[1] || 1);
    const pair = pairs.get(n) ?? { date: -1, amount: -1 };
    if (d && pair.date < 0) pair.date = i;
    if (a && pair.amount < 0) pair.amount = i;
    pairs.set(n, pair);
  });
  return [...pairs.entries()].sort((x, y) => x[0] - y[0]).map(([, p]) => p);
}

const RANK: Record<LeadOutcome, number> = { new: 0, no_answer: 1, qualified: 2, lost: 3, junk: 3, won: 4 };

type RawLead = { payments?: Payment[] } & Record<string, unknown>;
function mergePayments(a: unknown, b: unknown): RawLead {
  const ra = (a ?? {}) as RawLead, rb = (b ?? {}) as RawLead;
  const seen = new Set<string>();
  const payments = [...(ra.payments ?? []), ...(rb.payments ?? [])].filter((p) => {
    const k = `${p.date}|${p.amount}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return { ...rb, ...ra, payments };
}
const sumPayments = (raw: RawLead) => (raw.payments?.length ? raw.payments.reduce((x, p) => x + p.amount, 0) || null : null);

/**
 * The same person writing twice the same day (double form submit, form + WhatsApp) is one lead.
 * Keeps the row with the most telling status and fills its gaps from the others.
 */
export function dedupeLeads(all: NormalizedLead[]): { leads: NormalizedLead[]; merged: number } {
  const byKey = new Map<string, NormalizedLead>();
  for (const lead of all) {
    const digits = lead.phone.replace(/\D/g, "");
    const who = digits.length >= 7 ? digits.slice(-9) : lead.email.toLowerCase() || norm(lead.name);
    const key = `${who}|${lead.leadAt.toISOString().slice(0, 10)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...lead, externalId: hash(key) });
      continue;
    }
    const [keep, other] = RANK[lead.outcome] > RANK[prev.outcome] ? [lead, prev] : [prev, lead];
    byKey.set(key, {
      ...keep,
      externalId: hash(key),
      leadAt: prev.leadAt < lead.leadAt ? prev.leadAt : lead.leadAt,
      utm: { ...other.utm, ...keep.utm },
      raw: mergePayments(keep.raw, other.raw),
      value: sumPayments(mergePayments(keep.raw, other.raw)) ?? keep.value,
      campaign: keep.campaign || other.campaign,
    });
  }
  return { leads: [...byKey.values()], merged: all.length - byKey.size };
}

/**
 * Sales per period: «01.07-02.07» / «31.07» / «01.10-02-10» in the first column, and a «Продажі/Продажи/Sales»
 * block with «Кількість» and «Сума» sub-columns. Years are not written: the last row is taken as the most
 * recent past date and earlier rows step back a year whenever the dates would go forward.
 */
export function parseSalesRows(tab: string, values: string[][], today = new Date()): { sales: NormalizedSale[]; problem: string | null } {
  const head = values.slice(0, 3);
  let amountCol = -1, countCol = -1, salesFrom = 0;
  head.forEach((row) => row.forEach((c, i) => /^(продаж|sales)/.test(norm(c)) && (salesFrom = Math.max(salesFrom, i))));
  head.forEach((row) =>
    row.forEach((c, i) => {
      const h = norm(c);
      if (i < salesFrom) return;
      if (amountCol < 0 && /(сума|сумма|amount|revenue|выручк|виручк)/.test(h)) amountCol = i;
      if (countCol < 0 && /(кількість|количество|кол-во|count|qty)/.test(h)) countCol = i;
    }),
  );
  if (amountCol < 0) return { sales: [], problem: `На листе «${tab}» не нашли колонку «Сума»/«Сумма».` };
  const currency = /eur|€/i.test(head.flat().join(" ")) ? "EUR" : /usd|\$/i.test(head.flat().join(" ")) ? "USD" : /pln|zł/i.test(head.flat().join(" ")) ? "PLN" : "";
  const noteCol = head.flat().findIndex((c) => /(коментар|комментар|comment|примечан)/.test(norm(c)));

  type Raw = { label: string; sd: number; sm: number; ed: number; em: number; count: number; amount: number; note: string; cur: string };
  const raw: Raw[] = [];
  for (const row of values.slice(1)) {
    const label = (row[0] ?? "").trim();
    const start = label.match(/^(\d{1,2})[.](\d{1,2})/);
    const end = label.match(/(\d{1,2})[.\-](\d{1,2})\s*$/);
    if (!start || !end) continue;
    const amount = parseMoney(row[amountCol] ?? "");
    const count = countCol >= 0 ? parseMoney(row[countCol] ?? "") : 0;
    if (!amount && !count) continue;
    const cellCur = /€/.test(row[amountCol] ?? "") ? "EUR" : /\$/.test(row[amountCol] ?? "") ? "USD" : "";
    raw.push({ label, sd: +start[1], sm: +start[2], ed: +end[1], em: +end[2], count, amount, note: noteCol >= 0 ? (row[noteCol] ?? "").trim() : "", cur: cellCur });
  }
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayIso = today.toISOString().slice(0, 10);
  let year = today.getUTCFullYear();
  const sales: NormalizedSale[] = [];
  for (let i = raw.length - 1; i >= 0; i--) {
    const r = raw[i];
    let endIso = iso(year, r.em, r.ed);
    const next = sales[0]?.date ?? todayIso;
    if (endIso > next && !(i === raw.length - 1 && endIso <= todayIso)) {
      year -= 1;
      endIso = iso(year, r.em, r.ed);
    }
    const startYear = r.sm > r.em ? year - 1 : year;
    sales.unshift({
      externalId: hash(tab, endIso, r.label, String(i)),
      periodStart: iso(startYear, r.sm, r.sd),
      date: endIso,
      count: r.count,
      amount: r.amount,
      currency: r.cur || currency,
      note: r.note.slice(0, 300),
    });
  }
  return { sales, problem: null };
}
