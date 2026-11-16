import "server-only";
import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { copyFile, copyFolderTree, createFolder, findChild, folderInfo, FOLDER_MIME, uploadBytes } from "@/lib/google/drive";
import { getIntegration } from "@/lib/integrations/store";
import type { DriveConfig } from "@/lib/integrations/types";
import { BRIEF_SECTIONS, isAsked } from "./questions";
import { addBriefFile, getBrief } from "./store";

const MAX_LINKS = 30;
const MAX_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
/** Links that point at a file itself, by extension. */
const FILE_EXT = /\.(pdf|png|jpe?g|webp|gif|svg|heic|mp4|mov|webm|zip|docx?|xlsx?|pptx?|csv|txt|ai|eps|psd|fig|otf|ttf)$/i;

export interface LinkReport {
  ok: boolean;
  /** Files and folders now in «Бриф клиента». */
  copied: string[];
  /** Links that are pages, not files: written to «Ссылки из брифа». */
  listed: number;
  failed: { url: string; reason: string }[];
  message: string;
}

const driveId = (url: URL) => {
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;
  const path = url.pathname;
  const m =
    path.match(/\/folders\/([\w-]{10,})/) ??
    path.match(/\/file\/d\/([\w-]{10,})/) ??
    path.match(/\/(?:document|spreadsheets|presentation|forms)\/d\/([\w-]{10,})/);
  return m?.[1] ?? url.searchParams.get("id");
};

/** Addresses of the server's own network are never fetched: a link from a public form must not reach inside. */
function isPrivate(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new Error("только https-ссылки");
  if (url.username || url.password || (url.port && url.port !== "443")) throw new Error("ссылка с логином или нестандартным портом");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivate(a.address))) throw new Error("адрес недоступен извне");
}

/** Downloads a public file: https only, public addresses only (re-checked on every redirect), with size and time limits. */
async function download(start: URL) {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("пустой редирект");
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new Error(`сайт ответил ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("файл больше 50 МБ");
    const type = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    if (type === "text/html") throw new Error("по ссылке страница, а не файл");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error("пустой ответ");
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("файл больше 50 МБ");
      }
      chunks.push(value);
    }
    return { bytes: Buffer.concat(chunks), type };
  }
  throw new Error("слишком много редиректов");
}

/**
 * Everything the client linked to in the brief ends up in the project's Drive folder, in «Бриф клиента»:
 * Google Drive files and folders are copied, direct links to files are downloaded, and links to pages
 * (sites, social profiles) are written into one text file. A link is handled once.
 */
export async function collectBriefLinks(projectId: string): Promise<LinkReport> {
  const report: LinkReport = { ok: false, copied: [], listed: 0, failed: [], message: "" };
  const brief = await getBrief(projectId);
  if (!brief) return { ...report, message: "Брифа ещё нет." };
  const drive = await getIntegration(projectId, "drive");
  if (!drive) return { ...report, message: "Папка проекта на Drive не подключена — подключите её в карточке проекта." };

  const found: { url: string; question: string }[] = [];
  for (const section of BRIEF_SECTIONS) {
    for (const item of section.questions) {
      if (brief.hidden.includes(item.id) || !isAsked(item, brief.answers)) continue;
      for (const raw of (brief.answers[item.id] ?? "").match(/https?:\/\/[^\s<>"')\]]+/g) ?? []) {
        const url = raw.replace(/[.,;:!?]+$/, "");
        if (!found.some((f) => f.url === url)) found.push({ url, question: item.q.ru });
      }
    }
  }
  if (!found.length) return { ...report, ok: true, message: "Ссылок в брифе нет." };

  const done = new Set(brief.files.map((f) => f.url).filter(Boolean));
  const parent = (drive.config as DriveConfig).folderId;
  const folder = (await findChild(parent, "Бриф клиента", FOLDER_MIME)) ?? (await createFolder(parent, "Бриф клиента"));
  const pages: { url: string; question: string }[] = [];

  for (const link of found.slice(0, MAX_LINKS)) {
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    const id = driveId(url);
    const direct = FILE_EXT.test(url.pathname);
    if (!id && !direct) {
      pages.push(link);
      continue;
    }
    if (done.has(link.url)) continue;
    try {
      let name: string;
      if (id) {
        const info = await folderInfo(id);
        name = info.name;
        if (info.mimeType === FOLDER_MIME) await copyFolderTree(id, folder.id, info.name);
        else await copyFile(id, folder.id, info.name);
      } else {
        const file = await download(url);
        name = decodeURIComponent(url.pathname.split("/").pop() || "file").slice(0, 150);
        await uploadBytes(folder.id, name, file.type, file.bytes);
      }
      await addBriefFile(projectId, name, link.url);
      report.copied.push(name);
    } catch (error) {
      // Not reachable as a file (closed access, a viewer page): keep it in the list of links instead of losing it.
      report.failed.push({ url: link.url, reason: (error as Error).message.slice(0, 160) });
      pages.push(link);
    }
  }

  if (pages.length) {
    const body = `Ссылки из брифа клиента\n\n${pages.map((p) => `${p.question}\n${p.url}`).join("\n\n")}\n`;
    const key = `list:${createHash("sha1").update(body).digest("hex").slice(0, 16)}`;
    report.listed = pages.length;
    if (!done.has(key)) {
      try {
        const name = `Ссылки из брифа ${new Date().toISOString().slice(0, 10)}.txt`;
        await uploadBytes(folder.id, name, "text/plain; charset=utf-8", Buffer.from(body, "utf8"));
        await addBriefFile(projectId, name, key);
        report.copied.push(name);
      } catch (error) {
        report.failed.push({ url: "список ссылок", reason: (error as Error).message.slice(0, 160) });
      }
    }
  }

  report.ok = true;
  report.message =
    [
      report.copied.length ? `На Drive добавлено: ${report.copied.length}` : "Новых файлов нет",
      report.listed ? `ссылок на страницы в списке: ${report.listed}` : null,
      report.failed.length ? `не удалось скачать: ${report.failed.length}` : null,
    ]
      .filter(Boolean)
      .join(" · ") + ".";
  return report;
}
