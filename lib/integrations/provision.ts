import "server-only";
import { GOOGLE_LAYOUT, TEMPLATE_SKIP_FILES } from "@/config/google";
import { copyFile, copyFolderTree, createFolder, findChild, FOLDER_MIME, folderInfo, folderUrl, listTree, renameFile } from "@/lib/google/drive";
import { batchUpdate, spreadsheetInfo, spreadsheetUrl } from "@/lib/google/sheets";
import { detectReport, resetReportCopy } from "./sheets";
import { getIntegration, markIntegration, patchIntegrationConfig, saveIntegration } from "./store";
import type { DriveConfig, SheetsLeadsConfig } from "./types";

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

/** Every project folder has «Content» for SMM materials. */
export const CONTENT_FOLDER = "Content";

export async function ensureSubfolder(parentId: string, name: string) {
  return (await findChild(parentId, name, FOLDER_MIME)) ?? (await createFolder(parentId, name));
}

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
  await ensureSubfolder(folderId, CONTENT_FOLDER);
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

/**
 * The project got a new name: the Drive folder and everything inside it that carries the old name follow.
 *  - Any file or subfolder with the old name in its title gets the new one (case and spaces do not matter:
 *    «LEX DIXIT», «NowaMowa»).
 *  - The folder itself (when it sits in PROFITAD → PROJECTS), the «Репорт» and the «Leads & Sales» get their
 *    standard names even if they still carry a name from two renames ago.
 * Only the project folder is touched — a connected sheet that lives elsewhere (e.g. the client's own table) keeps
 * its name and is returned in `outside`. `oldName` = null: only bring the standard names in line.
 */
export async function renameProjectAssets(projectId: string, oldName: string | null, newName: string) {
  const to = newName.trim();
  const from = (oldName ?? "").trim();
  const result = { folder: false, files: 0, outside: [] as string[] };
  if (!to) return result;
  const drive = await getIntegration(projectId, "drive");
  if (!drive) return result;
  const { folderId } = drive.config as DriveConfig;
  const old =
    from.length >= 2 && from !== to
      ? new RegExp(from.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "gi")
      : null;
  const has = (name: string) => Boolean(old && name.search(old) !== -1);
  const swap = (name: string) => (old ? name.replace(old, to) : name);
  const rename = async (id: string, current: string, next: string) => {
    if (next === current) return false;
    await renameFile(id, next);
    return true;
  };

  const folder = await folderInfo(folderId);
  const ours = (folder.parents ?? []).includes(GOOGLE_LAYOUT.projectsParent);
  const folderName = has(folder.name) ? swap(folder.name) : ours ? to : folder.name;
  result.folder = await rename(folderId, folder.name, folderName);

  const tree = await listTree(folderId);
  const standard = new Map<string, string>();
  const titles: { kind: "sheets_report" | "sheets_leads"; id: string; title: string }[] = [];
  for (const [kind, name] of [["sheets_report", `${to} — Репорт`], ["sheets_leads", leadsSheetName(to)]] as const) {
    const rec = await getIntegration(projectId, kind);
    if (!rec) continue;
    const cfg = rec.config as { spreadsheetId: string; title?: string };
    titles.push({ kind, id: cfg.spreadsheetId, title: cfg.title ?? "" });
    standard.set(cfg.spreadsheetId, name);
  }
  const renamed = new Map<string, string>();
  for (const file of tree) {
    // A connected sheet without the old name in its title carries a stale one: give it the standard name.
    const next = has(file.name) ? swap(file.name) : file.name.toLowerCase().includes(to.toLowerCase()) ? file.name : (standard.get(file.id) ?? file.name);
    if (await rename(file.id, file.name, next)) {
      renamed.set(file.id, next);
      result.files += 1;
    }
  }
  await patchIntegrationConfig(projectId, "drive", { name: folderName });
  const inTree = new Set(tree.map((f) => f.id));
  for (const t of titles) {
    const name = renamed.get(t.id);
    if (name) await patchIntegrationConfig(projectId, t.kind, { title: name });
    else if (!inTree.has(t.id) && has(t.title)) result.outside.push(t.title);
  }
  return result;
}
