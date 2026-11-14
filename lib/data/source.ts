import type { IsoDate, Project } from "@/lib/domain/types";

/** Date range the numbers are for; `end` may be in the future (a whole month is planned). */
export interface Range {
  start: IsoDate;
  end: IsoDate;
}

/**
 * Contract every data provider implements (mock, database, ad-platform APIs, CRM...).
 * UI and cache layers depend only on this interface.
 */
export interface DataSource {
  /** Default range: the current calendar month. */
  listProjects(range?: Range): Promise<Project[]>;
  getProject(id: string, range?: Range): Promise<Project | null>;
}
