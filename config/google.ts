/**
 * Google Drive / Sheets layout of the agency. Ids are not secrets; env vars override them.
 * - projectsParent: where every project gets its own folder (PROFITAD → PROJECTS).
 * - projectTemplate: folder copied for a new project (Template Project).
 * - reportTemplate: spreadsheet copied as the project's «Репорт».
 */
export const GOOGLE_LAYOUT = {
  projectsParent: process.env.DRIVE_PROJECTS_PARENT_ID || "1gP75nbPMGlfB9LdwMbr54uz56cY-eszY",
  projectTemplate: process.env.DRIVE_PROJECT_TEMPLATE_ID || "1MbRs1R_e5-WGetHyQqbEUCrVn_PE7wHw",
  reportTemplate: process.env.REPORT_TEMPLATE_SHEET_ID || "1wiKJGq059HLvqok9XNbKLNWsmdLuGNVFlkIqn_D00qQ",
} as const;
