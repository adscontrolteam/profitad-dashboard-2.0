import "server-only";
import { googleAccessToken, googleFetch, SCOPES, workspaceUser } from "./auth";

const API = "https://www.googleapis.com/drive/v3";
const ALL_DRIVES = "supportsAllDrives=true";
/** Drive acts as the Workspace user when delegation is configured: files are theirs, in their My Drive. */
const AS_USER = { asWorkspaceUser: true };
export const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Accepts a Drive folder link or a bare folder id. */
export function parseFolderId(input: string) {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) ?? input.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(input.trim()) ? input.trim() : null;
}

export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string | null;
  thumbnailLink: string | null;
}

const drive = <T>(path: string, init: RequestInit = {}) => googleFetch<T>(`${API}/${path}`, [SCOPES.drive], init, AS_USER);
const json = (body: object): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function folderInfo(id: string) {
  return drive<{ id: string; name: string; driveId?: string; mimeType: string }>(`files/${id}?fields=id,name,driveId,mimeType&${ALL_DRIVES}`);
}

async function children(folderId: string, extraQuery = "", fields = "files(id,name,mimeType)", limit = 1000) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false${extraQuery}`);
  const out: { id: string; name: string; mimeType: string }[] = [];
  let pageToken = "";
  do {
    const data = await drive<{ files?: { id: string; name: string; mimeType: string }[]; nextPageToken?: string }>(
      `files?q=${q}&fields=nextPageToken,${encodeURIComponent(fields)}&pageSize=${Math.min(limit, 1000)}&${ALL_DRIVES}&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken && out.length < limit);
  return out;
}

export async function listFolder(folderId: string, limit = 60): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)");
  const data = await drive<{ files?: (Omit<DriveFile, "size"> & { size?: string })[] }>(
    `files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=${limit}&${ALL_DRIVES}&includeItemsFromAllDrives=true`,
  );
  return (data.files ?? []).map((f) => ({ ...f, size: f.size ? Number(f.size) : null, webViewLink: f.webViewLink ?? null, thumbnailLink: f.thumbnailLink ?? null }));
}

const escapeQ = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** A direct child with exactly this name (and type, if given). */
export async function findChild(parentId: string, name: string, mimeType?: string) {
  const [hit] = await children(parentId, ` and name = '${escapeQ(name)}'${mimeType ? ` and mimeType = '${mimeType}'` : ""}`, "files(id,name,mimeType)", 1);
  return hit ?? null;
}

export async function createFolder(parentId: string, name: string) {
  return drive<{ id: string; name: string }>(`files?${ALL_DRIVES}&fields=id,name`, json({ name, mimeType: FOLDER_MIME, parents: [parentId] }));
}

export async function copyFile(fileId: string, parentId: string, name: string) {
  return drive<{ id: string; name: string; mimeType: string }>(`files/${fileId}/copy?${ALL_DRIVES}&fields=id,name,mimeType`, json({ name, parents: [parentId] }));
}

/** Drive has no "copy folder": recreate the folder tree and copy every file into it. */
export async function copyFolderTree(templateId: string, parentId: string, name: string, depth = 0): Promise<string> {
  const target = await createFolder(parentId, name);
  if (depth > 6) return target.id;
  for (const child of await children(templateId)) {
    if (child.mimeType === FOLDER_MIME) await copyFolderTree(child.id, target.id, child.name, depth + 1);
    else await copyFile(child.id, target.id, child.name);
  }
  return target.id;
}

/**
 * Starts a resumable upload into the folder and returns the session URL.
 * The browser then PUTs the file straight to Google (no size limit of our functions);
 * passing the page origin makes Google answer the browser's CORS request.
 */
export async function startResumableUpload(folderId: string, name: string, mimeType: string, size: number, origin: string) {
  const token = await googleAccessToken([SCOPES.drive], workspaceUser());
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
    throw new Error(
      /storage ?quota/i.test(text)
        ? "У сервис-аккаунта нет своего места на Drive: включите делегирование на уровне домена (GOOGLE_WORKSPACE_USER) или используйте общий диск."
        : `Drive не принял загрузку (${res.status})`,
    );
  }
  return location;
}
