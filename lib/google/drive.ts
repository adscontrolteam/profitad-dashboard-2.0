import "server-only";
import { googleFetch, googleAccessToken, SCOPES } from "./auth";

const API = "https://www.googleapis.com/drive/v3";
const ALL_DRIVES = "supportsAllDrives=true";

/** Accepts a Drive folder link or a bare folder id. */
export function parseFolderId(input: string) {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) ?? input.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(input.trim()) ? input.trim() : null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string | null;
  thumbnailLink: string | null;
}

export async function folderInfo(id: string) {
  return googleFetch<{ id: string; name: string; driveId?: string; mimeType: string }>(
    `${API}/files/${id}?fields=id,name,driveId,mimeType&${ALL_DRIVES}`,
    [SCOPES.drive],
  );
}

export async function listFolder(folderId: string, limit = 60): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)");
  const data = await googleFetch<{ files?: (Omit<DriveFile, "size"> & { size?: string })[] }>(
    `${API}/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=${limit}&${ALL_DRIVES}&includeItemsFromAllDrives=true`,
    [SCOPES.drive],
  );
  return (data.files ?? []).map((f) => ({ ...f, size: f.size ? Number(f.size) : null, webViewLink: f.webViewLink ?? null, thumbnailLink: f.thumbnailLink ?? null }));
}

/**
 * Starts a resumable upload into the folder and returns the session URL.
 * The browser then PUTs the file straight to Google (no size limit of our functions);
 * passing the page origin makes Google answer the browser's CORS request.
 */
export async function startResumableUpload(folderId: string, name: string, mimeType: string, size: number, origin: string) {
  const token = await googleAccessToken([SCOPES.drive]);
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&${ALL_DRIVES}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mimeType || "application/octet-stream",
      "x-upload-content-length": String(size),
      origin,
    },
    body: JSON.stringify({ name, parents: [folderId] }),
    cache: "no-store",
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) {
    const text = await res.text().catch(() => "");
    throw new Error(text.includes("storageQuotaExceeded") || text.includes("storage quota")
      ? "У сервис-аккаунта нет своего места на Drive: папка должна лежать на общем диске (Shared Drive)."
      : `Drive не принял загрузку (${res.status})`);
  }
  return location;
}
