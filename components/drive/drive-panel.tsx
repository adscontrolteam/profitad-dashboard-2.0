"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface DriveFileView {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string | null;
  thumbnailLink: string | null;
}

const kb = (n: number | null) => (n === null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1e3))} КБ`);

function kindIcon(mime: string) {
  if (mime.startsWith("video/")) return "▶";
  if (mime.startsWith("image/")) return "▣";
  if (mime.includes("folder")) return "▤";
  return "≡";
}

/** Project's Google Drive folder: sources to use, and the place where content made here is uploaded. */
export function DrivePanel({
  projectId,
  folder,
  files,
  error,
  canUpload,
}: {
  projectId: string;
  folder: { name: string; url: string } | null;
  files: DriveFileView[];
  error: string | null;
  canUpload: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!folder) {
    return (
      <section className="rounded-[var(--radius)] border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
        Google Drive не подключён к проекту. Администратор подключает папку в карточке проекта во «Вводных» → «Подключения».
      </section>
    );
  }

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setMessage(null);
    let uploaded = 0;
    for (const file of Array.from(list)) {
      const res = await fetch("/api/drive/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, name: file.name, mimeType: file.type, size: file.size }),
      });
      const body = (await res.json().catch(() => ({}))) as { uploadUrl?: string; error?: string };
      if (!res.ok || !body.uploadUrl) {
        setMessage({ ok: false, text: body.error ?? "Не удалось начать загрузку" });
        break;
      }
      const ok = await new Promise<boolean>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", body.uploadUrl!);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) });
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);
        xhr.send(file);
      });
      if (!ok) {
        setMessage({ ok: false, text: `«${file.name}» не загрузился` });
        break;
      }
      uploaded++;
    }
    setProgress(null);
    if (uploaded) {
      setMessage({ ok: true, text: `Загружено в Drive: ${uploaded}` });
      router.refresh();
    }
    if (input.current) input.current.value = "";
  };

  return (
    <section className="min-w-0 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">Google Drive · исходники</h2>
          <a href={folder.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline decoration-dotted">
            Папка «{folder.name}» ↗
          </a>
        </div>
        {canUpload && (
          <>
            <button type="button" className="btn-primary" disabled={Boolean(progress)} onClick={() => input.current?.click()}>
              {progress ? `${progress.pct}% · ${progress.name.slice(0, 18)}` : "Загрузить в Drive"}
            </button>
            <input ref={input} type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
          </>
        )}
      </div>
      {message && <p className={cn("mb-3 text-sm font-medium", message.ok ? "text-positive" : "text-negative")}>{message.text}</p>}
      {error ? (
        <p className="text-sm text-negative">{error}</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">В папке пока пусто.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {files.map((f) => (
            <li key={f.id} className="min-w-0">
              <a
                href={f.webViewLink ?? folder.url}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col gap-1.5"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/uri-list", f.webViewLink ?? "")}
              >
                <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[16px] bg-muted text-2xl text-muted-foreground">
                  {f.thumbnailLink ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Drive thumbnail
                    <img src={f.thumbnailLink} alt="" referrerPolicy="no-referrer" className="size-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    kindIcon(f.mimeType)
                  )}
                </span>
                <span className="truncate text-xs font-medium">{f.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(f.modifiedTime).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} {kb(f.size)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
