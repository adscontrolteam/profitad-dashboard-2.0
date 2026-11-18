import "server-only";
import { GOOGLE_LAYOUT, TEMPLATE_SKIP_FILES } from "@/config/google";
import { copyFile, copyFolderTree, findChild, FOLDER_MIME, folderUrl } from "@/lib/google/drive";
import { batchUpdate, spreadsheetInfo, spreadsheetUrl } from "@/lib/google/sheets";
import { detectReport, resetReportCopy } from "./sheets";
import { getIntegration, markIntegration, saveIntegration } from "./store";
import type { DriveConfig, SheetsLeadsConfig } from "./types";

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

/**
 * The project's Drive folder: an existing folder with the project's name under PROFITAD → PROJECTS is reused,
 * otherwise the Template Project folder is copied. Returns the folder and whether it was created now.
 */
export async function ensureProjectFolder(projectId: string, projectName: string, actorEmail: string) {
  const existing = await getIntegration(projectId, "drive");
  if (existing) return { folderId: (existing.config as DriveConfig).folderId, created: false };

  const found = await findChild(GOOGLE_LAYOUT.projectsParent, projectName, FOLDER_MIME);
  const folderId = found?.id ?? (await copyFolderTree(GOOGLE_LAYOUT.projectTemplate, GOOGLE_LAYOUT.projectsParent, projectName, 0, (file) =>
      TEMPLATE_SKIP_FILES.some((re) => re.test(file.trim())),
    ));
  await saveIntegration(projectId, "drive", { url: folderUrl(folderId), folderId, name: projectName }, null, actorEmail);
  await markIntegration(projectId, "drive", null);
  return { folderId, created: !found };
}

/**
 * The project's «Репорт»: copies the report template into the project folder (or reuses a spreadsheet with
 * the same name there), clears the template's old days and connects it with the detected columns.
 */
export async function ensureReport(projectId: string, projectName: string, actorEmail: string) {
  const existing = await getIntegration(projectId, "sheets_report");
  if (existing) return { spreadsheetId: (existing.config as { spreadsheetId: string }).spreadsheetId, created: false };

  const { folderId } = await ensureProjectFolder(projectId, projectName, actorEmail);
  const name = `${projectName} — Репорт`;
  const found = await findChild(folderId, name, SHEET_MIME);
  const spreadsheetId = found?.id ?? (await copyFile(GOOGLE_LAYOUT.reportTemplate, folderId, name)).id;

  const report = await detectReport(spreadsheetId);
  if (!found) await resetReportCopy(spreadsheetId, report.tabs);
  await saveIntegration(
    projectId,
    "sheets_report",
    { url: spreadsheetUrl(spreadsheetId), spreadsheetId, title: report.title || name, tabs: report.tabs },
    null,
    actorEmail,
  );
  return { spreadsheetId, created: !found };
}

export const leadsSheetName = (projectName: string) => `PROFITAD | ${projectName} Leads & Sales`;

/**
 * The project's «Leads & Sales»: copies the template into the project folder (or reuses a spreadsheet with the same
 * name there), empties the copied rows and connects it — LEADS as the lead tab, SALES filled by the dashboard.
 */
export async function ensureLeadsSheet(projectId: string, projectName: string, actorEmail: string) {
  const existing = await getIntegration(projectId, "sheets_leads");
  if (existing) return { spreadsheetId: (existing.config as SheetsLeadsConfig).spreadsheetId, created: false };

  const { folderId } = await ensureProjectFolder(projectId, projectName, actorEmail);
  const name = leadsSheetName(projectName);
  const found = await findChild(folderId, name, SHEET_MIME);
  const spreadsheetId = found?.id ?? (await copyFile(GOOGLE_LAYOUT.leadsTemplate, folderId, name)).id;

  const info = await spreadsheetInfo(spreadsheetId);
  const pick = (re: RegExp) => info.tabs.find((t) => re.test(t.trim())) ?? null;
  const leadsTab = pick(/^leads$/i) ?? info.tabs[0];
  const salesTab = pick(/^sales$/i) ?? pick(/продаж/i);
  if (!leadsTab) throw new Error("В шаблоне Leads & Sales нет листов.");

  if (!found) {
    // The template is a live sheet: keep the headers (1 row of leads, 2 rows of sales), drop whatever rows it carries.
    const clear = (tab: string | null, headerRows: number) => {
      const sheetId = tab ? info.sheetIds.get(tab) : undefined;
      return sheetId === undefined ? [] : [{ updateCells: { range: { sheetId, startRowIndex: headerRows }, fields: "userEnteredValue" } }];
    };
    await batchUpdate(spreadsheetId, [...clear(leadsTab, 1), ...clear(salesTab, 2)]);
  }
  await saveIntegration(
    projectId,
    "sheets_leads",
    { url: spreadsheetUrl(spreadsheetId), spreadsheetId, title: info.title || name, tab: leadsTab, tabs: [leadsTab], salesTab, salesAutofill: Boolean(salesTab), salesAutofillFrom: null },
    null,
    actorEmail,
  );
  return { spreadsheetId, created: !found };
}
