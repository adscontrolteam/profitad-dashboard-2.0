import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily } from "@/db/schema";
import { columnLetter, readRange, spreadsheetInfo, writeCells } from "@/lib/google/sheets";
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

function sameDay(cell: string, iso: string) {
  const c = cell.trim();
  if (c === ddmmyyyy(iso) || c === iso) return true;
  const m = c.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return Boolean(m && `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` === iso);
}

/**
 * Writes the last `days` days of ad results into the report: finds the row by date in column A and fills
 * only the mapped cells. Rows are never inserted; formulas and manual columns stay as they are.
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
  for (const tab of cfg.tabs) {
    const relevant = rows.filter((r) => tab.platform === "all" || r.platform === tab.platform);
    if (relevant.length === 0) continue;
    const colA = (await readRange(cfg.spreadsheetId, tab.tab, "A1:A1500")).map((r) => r[0] ?? "");
    const dates = [...new Set(relevant.map((r) => String(r.date)))];
    for (const date of dates) {
      const rowIndex = colA.findIndex((v) => sameDay(v, date));
      if (rowIndex < 0) continue;
      const dayRows = relevant.filter((r) => String(r.date) === date);
      for (const metric of REPORT_METRICS) {
        const col = tab.columns[metric];
        if (!col) continue;
        const total = dayRows.reduce((a, r) => a + Number(r[metric] ?? 0), 0);
        if (metric !== "spend" && total === 0) continue; // keep manual counts if we have nothing
        cells.push({ tab: tab.tab, cell: `${col}${rowIndex + 1}`, value: metric === "spend" ? Math.round(total * 100) / 100 : Math.round(total) });
      }
    }
  }
  return writeCells(cfg.spreadsheetId, cells);
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
