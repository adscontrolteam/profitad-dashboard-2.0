import { canViewProject } from "@/lib/access/policy";
import { getViewerState } from "@/lib/access/viewer";
import { audit } from "@/lib/audit";
import { startResumableUpload } from "@/lib/google/drive";
import { getIntegration } from "@/lib/integrations/store";
import type { DriveConfig } from "@/lib/integrations/types";

/**
 * Starts an upload into the project's Drive folder; the browser then sends the file straight to Google.
 * POST { projectId, name, mimeType, size } → { uploadUrl }
 */
export async function POST(request: Request) {
  const state = await getViewerState();
  if (state.status !== "ok") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { permissions, email } = state.viewer;
  if (!permissions.canManageAds && !permissions.canPublishContent) {
    return Response.json({ error: "Нет прав на загрузку контента" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { projectId?: string; name?: string; mimeType?: string; size?: number };
  const projectId = String(body.projectId ?? "");
  if (!projectId || !canViewProject(permissions, projectId)) return Response.json({ error: "Нет доступа к проекту" }, { status: 403 });
  const name = String(body.name ?? "").slice(0, 200);
  const size = Number(body.size);
  if (!name || !Number.isFinite(size) || size <= 0) return Response.json({ error: "Некорректный файл" }, { status: 400 });

  const drive = await getIntegration(projectId, "drive");
  if (!drive) return Response.json({ error: "У проекта не подключена папка Google Drive" }, { status: 409 });

  try {
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const uploadUrl = await startResumableUpload((drive.config as DriveConfig).folderId, name, String(body.mimeType ?? ""), size, origin);
    await audit({ actorEmail: email, action: "drive.upload", projectId, target: name, ok: true });
    return Response.json({ uploadUrl });
  } catch (error) {
    const message = (error as Error).message;
    await audit({ actorEmail: email, action: "drive.upload", projectId, target: name, ok: false, result: message });
    return Response.json({ error: message }, { status: 502 });
  }
}
