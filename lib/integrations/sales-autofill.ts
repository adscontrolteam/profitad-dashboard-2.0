import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leads } from "@/db/schema";
import { readRange, shiftFormulaRows, writeCells } from "@/lib/google/sheets";
import { FROM_ADS } from "./store";
import type { SheetsLeadsConfig } from "./types";

/**
 * Fills the client's sales-by-period tab («!Продажи») for the periods the dashboard owns:
 * ad leads (all / target / non-target) and payments from the lead tabs (count, sum, who paid).
 * Periods follow the tab's own rhythm — Mon–Tue, Wed–Thu, Fri–Sun. Rows kept by hand (before `salesAutofillFrom`)
 * are never touched; inside owned rows only the lead and sales cells are written, a comment only if empty or ours.
 * Nothing is written until the lead tabs get their first dated row (a test lead counts): periods start with the ads.
 */

const TZ = "Europe/Madrid";
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const AUTO = "авто:";

/** Mon–Tue / Wed–Thu / Fri–Sun bucket of a day. */
export function bucketOf(day: string): { start: string; end: string } {
  const t = Date.parse(`${day}T00:00:00Z`);
  const wd = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
  const startOff = wd <= 1 ? wd : wd <= 3 ? wd - 2 : wd - 4;
  const len = wd <= 3 ? 2 : 3;
  return { start: iso(t - startOff * DAY), end: iso(t + (len - 1 - startOff) * DAY) };
}

export const periodLabel = (b: { start: string; end: string }) => `${dm(b.start)}-${dm(b.end)}`;

/** «11.11-12.11», «01.10-02-10», «03.07–05.07» → "11.11|12.11" for comparison. */
const labelKey = (label: string) => {
  const m = label.trim().match(/^(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})[.\-](\d{1,2})$/);
  return m ? `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}|${m[3].padStart(2, "0")}.${m[4].padStart(2, "0")}` : null;
};

interface Columns {
  total: number;
  target: number;
  junk: number;
  salesCount: number;
  salesSum: number;
  note: number;
}

/** Finds «Google ADS → Всього / Цільові / Нецільові» and «Продажі → Кількість / Сума» in the two header rows. */
function findColumns(head: string[][]): Columns | null {
  const [top = [], sub = []] = head;
  const n = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  const block = (re: RegExp) => top.findIndex((c) => re.test(n(c)));
  const g = block(/google/);
  const sales = block(/^(продаж|sales)/);
  const note = top.findIndex((c) => /коментар|комментар|comment/.test(n(c)));
  if (g < 0 || sales < 0) return null;
  const after = (from: number, re: RegExp) => {
    for (let i = from; i < Math.max(sub.length, from + 4); i++) if (re.test(n(sub[i]))) return i;
    return -1;
  };
  const cols = {
    total: after(g, /^(всього|всего|total)/),
    target: after(g, /^ц[іi]льов|^целев/),
    junk: after(g, /^неціл|^нецел/),
    salesCount: after(sales, /кільк|колич|count/),
    salesSum: after(sales, /сум|amount/),
    note,
  };
  return cols.total >= 0 && cols.target >= 0 && cols.junk >= 0 && cols.salesSum >= 0 ? cols : null;
}

export async function fillSalesTab(projectId: string, cfg: SheetsLeadsConfig, firstLeadAt: Date | null, today = new Date(), dryRun = false) {
  if (!cfg.salesAutofill || !cfg.salesTab) return { cells: 0, from: cfg.salesAutofillFrom ?? null, message: "", planned: [] as { cell: string; value: string | number }[] };
  const values = await readRange(cfg.spreadsheetId, cfg.salesTab, "A1:Z1000", "FORMULA");
  const cols = findColumns(values.slice(0, 2));
  if (!cols) throw new Error(`На листе «${cfg.salesTab}» не нашли колонки Google ADS (Всього / Цільові / Нецільові) и Продажі (Сума).`);

  // Rows with a period label; the last row anybody filled by hand bounds what is ours.
  const rows = values.slice(2).map((r, i) => ({ row: i + 3, cells: r, key: labelKey(String(r[0] ?? "")) }));
  const filled = (r: string[]) =>
    [cols.total, cols.target, cols.junk, cols.salesCount, cols.salesSum, cols.note].some((c) => c >= 0 && String(r[c] ?? "").trim() !== "");

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(today);
  let from = cfg.salesAutofillFrom ?? null;
  if (!from) {
    // Nothing to own yet: the table has no leads, the ads have not started.
    if (!firstLeadAt) return { cells: 0, from: null, message: `«${cfg.salesTab}»: начнём заполнять с первого лида в таблице`, planned: [] };
    // First run: from the period of the first lead in the table (a test lead counts)…
    from = bucketOf(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(firstLeadAt)).start;
    // …but never over periods somebody filled by hand (dates inferred backwards from today).
    const lastFilled = [...rows].reverse().find((r) => r.key && filled(r.cells));
    if (lastFilled?.key) {
      const [, end] = lastFilled.key.split("|");
      let y = Number(todayIso.slice(0, 4));
      let endIso = `${y}-${end.slice(3, 5)}-${end.slice(0, 2)}`;
      // The running period ends up to two days ahead: only a later date belongs to the previous year.
      if (endIso > iso(Date.parse(todayIso) + 2 * DAY)) endIso = `${--y}-${end.slice(3, 5)}-${end.slice(0, 2)}`;
      const afterHand = iso(Date.parse(endIso) + DAY);
      if (afterHand > from) from = afterHand;
    }
  }

  // Periods from `from` up to the one running today.
  const buckets: { start: string; end: string }[] = [];
  for (let b = bucketOf(from); b.start <= todayIso && buckets.length < 400; b = bucketOf(iso(Date.parse(b.end) + DAY))) {
    buckets.push(b.start < from ? { start: from, end: b.end } : b);
  }
  if (!buckets.length) return { cells: 0, from, message: "", planned: [] };

  // Ad leads per local day; payments of every lead (any channel) per payment day.
  const db = getDb();
  const day = sql<string>`to_char(${leads.leadAt} at time zone ${TZ}, 'YYYY-MM-DD')`;
  const leadRows = await db
    .select({
      day,
      total: sql<number>`count(*)`,
      junk: sql<number>`count(*) filter (where ${leads.outcome} = 'junk')`,
    })
    .from(leads)
    .where(and(eq(leads.projectId, projectId), FROM_ADS, sql`${leads.leadAt} >= ${from}::date - interval '1 day'`))
    .groupBy(sql`1`);
  const pays = (
    await db.execute(sql`
      select p->>'date' as day, (p->>'amount')::float8 as amount, ${leads.id} as id, ${leads.name} as name
      from ${leads}, jsonb_array_elements(coalesce(${leads.raw}->'payments', '[]'::jsonb)) p
      where ${leads.projectId} = ${projectId} and coalesce(p->>'date', '') >= ${from} and (p->>'amount')::float8 > 0`)
  ).rows as { day: string; amount: number; id: string; name: string }[];

  const cells: { tab: string; cell: string; value: string | number }[] = [];
  const letter = (i: number) => String.fromCharCode(65 + i);
  let nextFree = (() => {
    let last = 2;
    rows.forEach((r) => String(r.cells[0] ?? "").trim() && (last = r.row));
    return last + 1;
  })();

  for (const b of buckets) {
    const key = labelKey(periodLabel(b))!;
    let target = rows.find((r) => r.key === key);
    let rowNo = target?.row;
    if (!rowNo) {
      rowNo = nextFree++;
      cells.push({ tab: cfg.salesTab, cell: `A${rowNo}`, value: periodLabel(b) });
      // Keep the «ВСЬОГО» formula going down, as the rows above have it.
      const above = values[rowNo - 2]?.[1];
      const here = values[rowNo - 1]?.[1];
      if (!here && typeof above === "string" && above.startsWith("=")) cells.push({ tab: cfg.salesTab, cell: `B${rowNo}`, value: shiftFormulaRows(above, 1) });
      values[rowNo - 1] = [periodLabel(b), values[rowNo - 1]?.[1] ?? ""];
      target = { row: rowNo, cells: values[rowNo - 1], key };
    }
    const inB = (d: string) => d >= b.start && d <= b.end;
    const ls = leadRows.filter((l) => inB(l.day));
    const total = ls.reduce((a, l) => a + Number(l.total), 0);
    const junk = ls.reduce((a, l) => a + Number(l.junk), 0);
    const ps = pays.filter((p) => inB(p.day));
    const sum = Math.round(ps.reduce((a, p) => a + Number(p.amount), 0) * 100) / 100;
    const payers = new Set(ps.map((p) => p.id)).size;

    cells.push(
      { tab: cfg.salesTab, cell: `${letter(cols.total)}${rowNo}`, value: total },
      { tab: cfg.salesTab, cell: `${letter(cols.target)}${rowNo}`, value: total - junk },
      { tab: cfg.salesTab, cell: `${letter(cols.junk)}${rowNo}`, value: junk },
      { tab: cfg.salesTab, cell: `${letter(cols.salesSum)}${rowNo}`, value: sum || "" },
    );
    if (cols.salesCount >= 0) cells.push({ tab: cfg.salesTab, cell: `${letter(cols.salesCount)}${rowNo}`, value: payers || "" });
    const note = String(target!.cells[cols.note] ?? "").trim();
    if (cols.note >= 0 && (!note || note.startsWith(AUTO))) {
      const who = ps.map((p) => `${p.name || "без имени"} ${Math.round(Number(p.amount))} €`).join(", ");
      cells.push({ tab: cfg.salesTab, cell: `${letter(cols.note)}${rowNo}`, value: who ? `${AUTO} ${who}` : "" });
    }
  }
  const planned = cells.map(({ cell, value }) => ({ cell, value }));
  const written = dryRun ? 0 : await writeCells(cfg.spreadsheetId, cells, "USER_ENTERED");
  return { cells: written, from, message: `«${cfg.salesTab}»: периодов ${buckets.length}, с ${dm(from)}`, planned };
}
