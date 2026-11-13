import "server-only";
import { GOOGLE_LAYOUT } from "@/config/google";
import { copyFile, copyFolderTree, findChild, FOLDER_MIME, folderUrl } from "@/lib/google/drive";
import { spreadsheetUrl } from "@/lib/google/sheets";
import { detectReport, resetReportCopy } from "./sheets";
import { getIntegration, markIntegration, saveIntegration } from "./store";
import type { DriveConfig } from "./types";

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

/**
 * The project's Drive folder: an existing folder with the project's name under PROFITAD → PROJECTS is reused,
 * otherwise the Template Project folder is copied. Returns the folder and whether it was created now.
 */
export async function ensureProjectFolder(projectId: string, projectName: string, actorEmail: string) {
  const existing = await getIntegration(projectId, "drive");
  if (existing) return { folderId: (existing.config as DriveConfig).folderId, created: false };

  const found = await findChild(GOOGLE_LAYOUT.projectsParent, projectName, FOLDER_MIME);
  const folderId = found?.id ?? (await copyFolderTree(GOOGLE_LAYOUT.projectTemplate, GOOGLE_LAYOUT.projectsParent, projectName));
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
