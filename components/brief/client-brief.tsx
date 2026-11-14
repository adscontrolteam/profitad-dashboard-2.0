"use client";

import { useCallback, useRef, useState } from "react";
import { briefFileUploadedAction, saveBriefAnswersAction, submitBriefAction } from "@/app/brief/actions";
import { cn } from "@/lib/cn";
import { BRIEF_UI, type BriefLang } from "@/lib/brief/questions";
import { BriefForm } from "./brief-form";

/** What the client sees behind the secret link: the questions, files, and «Готово». */
export function ClientBrief({
  token,
  lang,
  initial,
  hidden,
  status,
  files,
}: {
  token: string;
  lang: BriefLang;
  initial: Record<string, string>;
  hidden: string[];
  status: "draft" | "submitted" | "closed";
  files: string[];
}) {
  const ui = BRIEF_UI[lang];
  const [sent, setSent] = useState(status === "submitted");
  const [sending, setSending] = useState(false);
  const closed = status === "closed";
  const onSave = useCallback(async (patch: Record<string, string>) => (await saveBriefAnswersAction(token, patch)).ok, [token]);

  return (
    <div className="flex flex-col gap-5">
      {closed && <p className="rounded-2xl bg-muted px-4 py-3 text-sm">{ui.closed}</p>}
      <BriefForm
        lang={lang}
        initial={initial}
        hidden={hidden}
        readOnly={closed}
        onSave={onSave}
        filesSlot={closed ? null : <FileDrop token={token} lang={lang} initial={files} />}
      />
      {!closed && (
        <div className="flex flex-col items-start gap-2 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-6">
          {sent ? (
            <p className="text-sm font-medium text-positive">{ui.submitted}</p>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={sending}
                onClick={async () => {
                  setSending(true);
                  // Let a pending autosave land first.
                  (document.activeElement as HTMLElement | null)?.blur();
                  await new Promise((r) => setTimeout(r, 400));
                  const r = await submitBriefAction(token);
                  setSending(false);
                  if (r.ok) setSent(true);
                }}
              >
                {ui.submit}
              </button>
              <p className="text-xs text-muted-foreground">{ui.submitHint}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FileDrop({ token, lang, initial }: { token: string; lang: BriefLang; initial: string[] }) {
  const ui = BRIEF_UI[lang];
  const [items, setItems] = useState<{ name: string; state: "up" | "ok" | "err"; error?: string }[]>(initial.map((name) => ({ name, state: "ok" })));
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    const set = (patch: Partial<{ state: "up" | "ok" | "err"; error: string }>) =>
      setItems((list) => list.map((i) => (i.name === file.name && i.state !== "ok" ? { ...i, ...patch } : i)));
    setItems((list) => [...list.filter((i) => !(i.name === file.name && i.state === "err")), { name: file.name, state: "up" }]);
    try {
      const res = await fetch("/api/brief/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name: file.name, mimeType: file.type, size: file.size }),
      });
      const data = (await res.json()) as { uploadUrl?: string; error?: string };
      if (!res.ok || !data.uploadUrl) throw new Error(data.error ?? ui.uploadError);
      const put = await fetch(data.uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error(ui.uploadError);
      await briefFileUploadedAction(token, file.name);
      set({ state: "ok" });
    } catch (e) {
      set({ state: "err", error: (e as Error).message });
    }
  };
  const add = (files: FileList | null) => Array.from(files ?? []).slice(0, 20).forEach(upload);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{ui.files}</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-[20px] border-2 border-dashed px-4 py-6 text-center text-sm text-muted-foreground transition-colors",
          dragging ? "border-ring bg-muted" : "border-border hover:bg-muted/50",
        )}
      >
        {ui.filesHint}
      </button>
      <input ref={input} type="file" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
      {items.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {items.map((i, n) => (
            <li key={`${i.name}-${n}`} className="flex items-baseline gap-2">
              <span className="min-w-0 truncate">{i.name}</span>
              <span className={cn("ml-auto shrink-0", i.state === "err" ? "text-negative" : i.state === "ok" ? "text-positive" : "text-muted-foreground")}>
                {i.state === "up" ? ui.uploading : i.state === "ok" ? `✓ ${ui.uploaded}` : (i.error ?? ui.uploadError)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
