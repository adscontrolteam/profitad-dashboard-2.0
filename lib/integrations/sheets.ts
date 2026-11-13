import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily } from "@/db/schema";
import { batchUpdate, columnIndex, columnLetter, readRange, shiftFormulaRows, spreadsheetInfo, writeCells, writeRows } from "@/lib/google/sheets";
import { fingerprint, toDate } from "./crm";
import { REPORT_METRICS, type NormalizedLead, type ReportMetric, type ReportTab, type SheetsLeadsConfig, type SheetsReportConfig } from "./types";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Header names in report templates → our metrics. The first matching column wins. */
const REPORT_HEADERS: Record<ReportMetric, string[]> = {
  spend: ["budget", "spend", "расход", "бюджет"],
  impressions: ["impressions", "показы"],
  clicks: ["clicks", "клики"],
  leads: ["leads", "лиды", "заявки"],
  subscribers: ["subs", "subscribers", "подписки", "подписчики"],
};

function platformFromTab(tab: string): ReportTab["platform"] | null {
  const t = norm(tab);
  if (/google|гугл|ads ?g/.test(t)) return "google";
  if (/(^|\W)(fb|meta|facebook|inst|instagram|ig)(\W|$)/.test(t)) return "meta";
  return null;
}

/**
 * Reads the template and proposes what to fill: every tab whose first header cell is DATE/Дата,
 * with column letters found by header name. The admin can adjust before saving.
 */
export async function detectReport(spreadsheetId: string) {
  const info = await spreadsheetInfo(spreadsheetId);
  const tabs: ReportTab[] = [];
  for (const tab of info.tabs) {
    const [header = []] = await readRange(spreadsheetId, tab, "A1:AZ1");
    if (!/^(date|дата)$/i.test((header[0] ?? "").trim())) continue;
    const columns: ReportTab["columns"] = {};
    header.forEach((cell, i) => {
      const h = norm(cell ?? "");
      for (const metric of REPORT_METRICS) {
        if (!columns[metric] && REPORT_HEADERS[metric].includes(h)) columns[metric] = columnLetter(i);
      }
    });
    if (Object.keys(columns).length) tabs.push({ tab, platform: platformFromTab(tab) ?? "all", columns });
  }
  return { title: info.title, tabs };
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function sameDay(cell: string | undefined, iso: string) {
  const c = (cell ?? "").trim();
  if (c === ddmmyyyy(iso) || c === iso) return true;
  const m = c.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return Boolean(m && `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` === iso);
}

const isDateCell = (v: string | undefined) => {
  const c = (v ?? "").trim();
  return /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(c) || /^\d{4}-\d{2}-\d{2}$/.test(c);
};

/**
 * Writes the last `days` days of ad results into the report: finds the row by date in column A and fills
 * only the mapped cells. A missing day gets a new row under the last one, with the formulas of the last
 * day row copied down (like dragging a row in Sheets). Formulas and manual columns are never overwritten.
 */
export async function writeReport(projectId: string, cfg: SheetsReportConfig, days = 3) {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await getDb()
    .select({
      date: adMetricsDaily.date,
      platform: adMetricsDaily.platform,
      spend: sql<number>`sum(${adMetricsDaily.spend})`,
      impressions: sql<number>`sum(${adMetricsDaily.impressions})`,
      clicks: sql<number>`sum(${adMetricsDaily.clicks})`,
      leads: sql<number>`sum(${adMetricsDaily.leads})`,
      subscribers: sql<number>`sum(${adMetricsDaily.subscribers})`,
    })
    .from(adMetricsDaily)
    .where(and(eq(adMetricsDaily.projectId, projectId), gte(adMetricsDaily.date, since)))
    .groupBy(adMetricsDaily.date, adMetricsDaily.platform);

  const cells: { tab: string; cell: string; value: number }[] = [];
  const newRows: { tab: string; row: number; values: (string | number)[] }[] = [];
  const formatCopies: { tab: string; from: number; to: number }[] = [];

  for (const tab of cfg.tabs) {
    const relevant = rows.filter((r) => tab.platform === "all" || r.platform === tab.platform);
    if (relevant.length === 0) continue;
    const colA = (await readRange(cfg.spreadsheetId, tab.tab, "A1:A3000")).map((r) => r[0] ?? "");
    let nextFree = colA.length; // 0-based index of the first row after the used range
    const dates = [...new Set(relevant.map((r) => String(r.date)))].sort();

    const totalsFor = (date: string) => {
      const dayRows = relevant.filter((r) => String(r.date) === date);
      return Object.fromEntries(REPORT_METRICS.map((m) => [m, dayRows.reduce((a, r) => a + Number(r[m] ?? 0), 0)])) as Record<ReportMetric, number>;
    };
    const rounded = (m: ReportMetric, v: number) => (m === "spend" ? Math.round(v * 100) / 100 : Math.round(v));

    // Prototype row for new days: the last row with a date (or row 3 of an empty template).
    let protoIndex = -1;
    for (let i = colA.length - 1; i >= 1; i--) if (isDateCell(colA[i])) { protoIndex = i; break; }
    let protoFormulas: string[] | null = null;

    for (const date of dates) {
      const totals = totalsFor(date);
      const rowIndex = colA.findIndex((v) => sameDay(v, date));
      if (rowIndex >= 0) {
        for (const metric of REPORT_METRICS) {
          const col = tab.columns[metric];
          if (!col) continue;
          if (metric !== "spend" && totals[metric] === 0) continue; // keep manual counts if we have nothing
          cells.push({ tab: tab.tab, cell: `${col}${rowIndex + 1}`, value: rounded(metric, totals[metric]) });
        }
        continue;
      }
      if (date < (colA.filter((v) => isDateCell(v)).map(toIso).sort()[0] ?? "0000")) continue; // never insert before the history

      // New day: copy the prototype row's formulas, then put the date and our numbers in.
      if (protoFormulas === null) {
        const p = protoIndex >= 0 ? protoIndex : 2;
        const [row = []] = await readRange(cfg.spreadsheetId, tab.tab, `A${p + 1}:AZ${p + 1}`, "FORMULA");
        protoFormulas = row;
        if (protoIndex < 0) {
          protoIndex = p;
          nextFree = p; // empty template: the first data row is free
          while (colA.length < p) colA.push("");
        }
      }
      const target = nextFree++;
      const values: (string | number)[] = protoFormulas.map((v) => (typeof v === "string" && v.startsWith("=") ? shiftFormulaRows(v, target - protoIndex) : ""));
      values[0] = ddmmyyyy(date);
      for (const metric of REPORT_METRICS) {
        const col = tab.columns[metric];
        if (!col) continue;
        const idx = columnIndex(col);
        while (values.length <= idx) values.push("");
        values[idx] = rounded(metric, totals[metric]);
      }
      newRows.push({ tab: tab.tab, row: target + 1, values });
      if (target !== protoIndex) formatCopies.push({ tab: tab.tab, from: protoIndex, to: target });
      colA[target] = ddmmyyyy(date);
    }
  }
  const written = await writeCells(cfg.spreadsheetId, cells);
  const added = await writeRows(cfg.spreadsheetId, newRows);
  if (formatCopies.length) {
    // New rows take the number formats (%, currency) of the row they were copied from.
    const { sheetIds } = await spreadsheetInfo(cfg.spreadsheetId);
    await batchUpdate(
      cfg.spreadsheetId,
      formatCopies
        .filter((f) => sheetIds.has(f.tab))
        .map((f) => ({
          copyPaste: {
            source: { sheetId: sheetIds.get(f.tab), startRowIndex: f.from, endRowIndex: f.from + 1 },
            destination: { sheetId: sheetIds.get(f.tab), startRowIndex: f.to, endRowIndex: f.to + 1 },
            pasteType: "PASTE_FORMAT",
          },
        })),
    );
  }
  return written + added;
}

function toIso(cell: string) {
  const c = cell.trim();
  const m = c.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : c;
}

/**
 * A fresh copy of the report template still holds the template's old days. Keep the header and the first day
 * row (it carries the formulas), drop everything below and blank that row's date and metric cells.
 */
export async function resetReportCopy(spreadsheetId: string, tabs: ReportTab[]) {
  const info = await spreadsheetInfo(spreadsheetId);
  const requests: object[] = [];
  const clears: { tab: string; cell: string; value: string }[] = [];
  for (const tab of tabs) {
    const sheetId = info.sheetIds.get(tab.tab);
    if (sheetId === undefined) continue;
    const colA = (await readRange(spreadsheetId, tab.tab, "A1:A3000")).map((r) => r[0] ?? "");
    const first = colA.findIndex((v, i) => i > 0 && isDateCell(v));
    if (first < 0) continue;
    if (colA.length > first + 1) {
      requests.push({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: first + 1, endIndex: colA.length } } });
    }
    clears.push({ tab: tab.tab, cell: `A${first + 1}`, value: "" });
    for (const col of Object.values(tab.columns)) if (col) clears.push({ tab: tab.tab, cell: `${col}${first + 1}`, value: "" });
  }
  await batchUpdate(spreadsheetId, requests);
  await writeCells(spreadsheetId, clears);
}

/* ---------- Leads sheet ---------- */

const LEAD_HEADERS = {
  date: ["дата", "date", "created", "created_at", "время", "дата заявки"],
  name: ["имя", "name", "фио", "клиент"],
  phone: ["телефон", "phone", "тел", "номер"],
  email: ["email", "e-mail", "почта"],
  status: ["статус", "status", "этап"],
  campaign: ["кампания", "campaign", "источник", "source", "utm_campaign"],
  value: ["сумма", "value", "amount", "чек", "цена"],
} as const;

export async function readLeadsSheet(cfg: SheetsLeadsConfig): Promise<{ leads: NormalizedLead[]; columns: string[] }> {
  const values = await readRange(cfg.spreadsheetId, cfg.tab, "A1:Z5000");
  const [header = [], ...rows] = values;
  const index = Object.fromEntries(
    Object.entries(LEAD_HEADERS).map(([key, names]) => [key, header.findIndex((h) => (names as readonly string[]).includes(norm(h ?? "")))]),
  ) as Record<keyof typeof LEAD_HEADERS, number>;
  const found = Object.entries(index).filter(([, i]) => i >= 0).map(([k]) => k);
  const cell = (row: string[], key: keyof typeof LEAD_HEADERS) => (index[key] >= 0 ? (row[index[key]] ?? "").trim() : "");

  const leads = rows
    .filter((row) => row.some((v) => (v ?? "").trim()))
    .map((row) => {
      const leadAt = toDate(cell(row, "date"));
      const status = cell(row, "status");
      const value = Number(cell(row, "value").replace(/[^\d.,]/g, "").replace(",", "."));
      const outcome: NormalizedLead["outcome"] = /успех|продаж|оплач|won|клиент/i.test(status)
        ? "won"
        : /отказ|lost|не целев|спам|junk/i.test(status)
          ? "lost"
          : /квалиф|qualif|в работе/i.test(status)
            ? "qualified"
            : "new";
      return {
        externalId: fingerprint(cell(row, "date"), cell(row, "phone"), cell(row, "email"), cell(row, "name")),
        leadAt,
        name: cell(row, "name"),
        phone: cell(row, "phone"),
        email: cell(row, "email"),
        status,
        outcome,
        value: Number.isFinite(value) && value > 0 ? value : null,
        campaign: cell(row, "campaign"),
        utm: {},
        raw: null,
      } satisfies NormalizedLead;
    });
  return { leads, columns: found };
}
