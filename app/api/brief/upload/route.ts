import { getBriefByToken } from "@/lib/brief/store";
import { createFolder, findChild, FOLDER_MIME, startResumableUpload } from "@/lib/google/drive";
import { getIntegration } from "@/lib/integrations/store";
import type { DriveConfig } from "@/lib/integrations/types";

const MAX_SIZE = 500 * 1024 * 1024;
const MAX_FILES = 60;

/**
 * Public: starts an upload of a client's file into «Бриф клиента» inside the project's Drive folder.
 * The brief link's token is the credential. POST { token, name, mimeType, size } → { uploadUrl }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; name?: string; mimeType?: string; size?: number };
  const found = await getBriefByToken(String(body.token ?? ""));
  if (!found || found.brief.status === "closed") return Response.json({ error: "Ссылка недействительна" }, { status: 403 });
  const name = String(body.name ?? "").replace(/[\\/]/g, "_").slice(0, 200);
  const size = Number(body.size);
  if (!name || !Number.isFinite(size) || size <= 0 || size > MAX_SIZE) return Response.json({ error: "Файл слишком большой (до 500 МБ)" }, { status: 400 });
  if (found.brief.files.length >= MAX_FILES) return Response.json({ error: "Слишком много файлов — пришлите остальное менеджеру" }, { status: 400 });

  const drive = await getIntegration(found.brief.projectId, "drive");
  if (!drive) return Response.json({ error: "Папка проекта ещё не подключена — пришлите файлы менеджеру" }, { status: 409 });
  try {
    const parent = (drive.config as DriveConfig).folderId;
    const folder = (await findChild(parent, "Бриф клиента", FOLDER_MIME)) ?? (await createFolder(parent, "Бриф клиента"));
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const uploadUrl = await startResumableUpload(folder.id, name, String(body.mimeType ?? ""), size, origin);
    return Response.json({ uploadUrl });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
