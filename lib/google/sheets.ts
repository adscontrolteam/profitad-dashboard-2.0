import "server-only";
import { googleFetch, SCOPES } from "./auth";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
/** Sheets act as the Workspace user when delegation is configured. */
const AS_USER = { asWorkspaceUser: true };

/** Accepts a full Google Sheets link or a bare spreadsheet id. */
export function parseSpreadsheetId(input: string) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? input.trim() : null;
}

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

export async function spreadsheetInfo(id: string) {
  const data = await googleFetch<{ properties?: { title?: string }; sheets?: { properties: { title: string; sheetId: number } }[] }>(
    `${API}/${id}?fields=properties.title,sheets.properties(title,sheetId)`,
    [SCOPES.sheets],
    {},
    AS_USER,
  );
  const sheets = (data.sheets ?? []).map((s) => s.properties);
  return { title: data.properties?.title ?? "", tabs: sheets.map((s) => s.title), sheetIds: new Map(sheets.map((s) => [s.title, s.sheetId])) };
}

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export async function readRange(id: string, tab: string, range = "A1:AZ5000", render: "FORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE"): Promise<string[][]> {
  const data = await googleFetch<{ values?: string[][] }>(
    `${API}/${id}/values/${encodeURIComponent(`${quoteTab(tab)}!${range}`)}?valueRenderOption=${render}`,
    [SCOPES.sheets],
    {},
    AS_USER,
  );
  return data.values ?? [];
}

type Cell = { tab: string; cell: string; value: string | number };

/**
 * RAW: numbers stay numbers and the sheet's formatting applies.
 * USER_ENTERED: formulas and dates are parsed as if typed (used for new rows).
 */
export async function writeCells(id: string, cells: Cell[], mode: "RAW" | "USER_ENTERED" = "RAW") {
  if (cells.length === 0) return 0;
  const data = await googleFetch<{ totalUpdatedCells?: number }>(
    `${API}/${id}/values:batchUpdate`,
    [SCOPES.sheets],
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        valueInputOption: mode,
        data: cells.map((c) => ({ range: `${quoteTab(c.tab)}!${c.cell}`, values: [[c.value]] })),
      }),
    },
    AS_USER,
  );
  return data.totalUpdatedCells ?? 0;
}

/** Writes whole rows starting at column A (USER_ENTERED). */
export async function writeRows(id: string, rows: { tab: string; row: number; values: (string | number)[] }[]) {
  if (rows.length === 0) return 0;
  const data = await googleFetch<{ totalUpdatedCells?: number }>(
    `${API}/${id}/values:batchUpdate`,
    [SCOPES.sheets],
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: rows.map((r) => ({ range: `${quoteTab(r.tab)}!A${r.row}`, values: [r.values] })),
      }),
    },
    AS_USER,
  );
  return data.totalUpdatedCells ?? 0;
}

/** Raw spreadsheets:batchUpdate (delete rows, etc.). */
export async function batchUpdate(id: string, requests: object[]) {
  if (requests.length === 0) return;
  await googleFetch(`${API}/${id}:batchUpdate`, [SCOPES.sheets], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  }, AS_USER);
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index: number) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function columnIndex(letter: string) {
  return letter.toUpperCase().split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

/**
 * Moves relative row references of a formula by `delta` rows, the way Sheets does when a formula is copied down.
 * Absolute rows ($3), text in quotes and quoted sheet names are left alone.
 */
export function shiftFormulaRows(formula: string, delta: number) {
  if (!formula.startsWith("=") || delta === 0) return formula;
  return formula
    .split(/("(?:[^"]|"")*"|'(?:[^']|'')*')/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)(?![\d(])/g, (m, col: string, abs: string, row: string) =>
            abs ? m : `${col}${Number(row) + delta}`,
          ),
    )
    .join("");
}
