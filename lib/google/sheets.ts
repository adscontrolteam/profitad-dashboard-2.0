import "server-only";
import { googleFetch, SCOPES } from "./auth";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Accepts a full Google Sheets link or a bare spreadsheet id. */
export function parseSpreadsheetId(input: string) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(input.trim()) ? input.trim() : null;
}

export async function spreadsheetInfo(id: string) {
  const data = await googleFetch<{ properties?: { title?: string }; sheets?: { properties: { title: string; sheetId: number } }[] }>(
    `${API}/${id}?fields=properties.title,sheets.properties(title,sheetId)`,
    [SCOPES.sheets],
  );
  return { title: data.properties?.title ?? "", tabs: (data.sheets ?? []).map((s) => s.properties.title) };
}

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export async function readRange(id: string, tab: string, range = "A1:AZ5000"): Promise<string[][]> {
  const data = await googleFetch<{ values?: string[][] }>(
    `${API}/${id}/values/${encodeURIComponent(`${quoteTab(tab)}!${range}`)}?valueRenderOption=FORMATTED_VALUE`,
    [SCOPES.sheets],
  );
  return data.values ?? [];
}

/** Writes numbers/strings into single cells (RAW: numbers stay numbers, the sheet's own formatting applies). */
export async function writeCells(id: string, cells: { tab: string; cell: string; value: string | number }[]) {
  if (cells.length === 0) return 0;
  const data = await googleFetch<{ totalUpdatedCells?: number }>(`${API}/${id}/values:batchUpdate`, [SCOPES.sheets], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: cells.map((c) => ({ range: `${quoteTab(c.tab)}!${c.cell}`, values: [[c.value]] })),
    }),
  });
  return data.totalUpdatedCells ?? 0;
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
