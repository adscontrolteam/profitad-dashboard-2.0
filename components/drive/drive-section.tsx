import { GoogleApiError } from "@/lib/google/auth";
import { listFolder } from "@/lib/google/drive";
import { getIntegration } from "@/lib/integrations/store";
import type { DriveConfig } from "@/lib/integrations/types";
import { DrivePanel, type DriveFileView } from "./drive-panel";

/** Server part: reads the project's Drive folder and renders the panel. */
export async function DriveSection({ projectId, canUpload }: { projectId: string; canUpload: boolean }) {
  const rec = await getIntegration(projectId, "drive");
  if (!rec) return <DrivePanel projectId={projectId} folder={null} files={[]} error={null} canUpload={false} />;
  const cfg = rec.config as DriveConfig;
  let files: DriveFileView[] = [];
  let error: string | null = null;
  try {
    files = await listFolder(cfg.folderId);
  } catch (e) {
    error = e instanceof GoogleApiError && (e.status === 403 || e.status === 404)
      ? "Нет доступа к папке: откройте её сервис-аккаунту."
      : (e as Error).message;
  }
  return <DrivePanel projectId={projectId} folder={{ name: cfg.name, url: cfg.url }} files={files} error={error} canUpload={canUpload} />;
}
