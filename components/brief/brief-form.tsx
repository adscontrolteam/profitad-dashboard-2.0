"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { BRIEF_SECTIONS, BRIEF_UI, type BriefLang } from "@/lib/brief/questions";

export interface BriefFormProps {
  lang: BriefLang;
  initial: Record<string, string>;
  hidden: string[];
  /** Client page: read-only once the brief is closed. */
  readOnly?: boolean;
  /** Saves a patch of answers; resolves false when it did not go through. */
  onSave: (patch: Record<string, string>) => Promise<boolean>;
  /** Extra controls per question (admin: hide toggle, internal note). */
  renderExtra?: (questionId: string) => React.ReactNode;
  /** Admin view shows hidden questions greyed out instead of dropping them. */
  showHidden?: boolean;
  onProgress?: (done: number, total: number) => void;
  /** Rendered at the end of a section that collects files. */
  filesSlot?: React.ReactNode;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** The brief's questions by section with autosave: a changed answer is sent ~1 s after typing stops and on blur. */
export function BriefForm({ lang, initial, hidden, readOnly = false, onSave, renderExtra, showHidden = false, onProgress, filesSlot }: BriefFormProps) {
  const ui = BRIEF_UI[lang];
  const [answers, setAnswers] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const dirty = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  /** Latest `flush`, for the retry timer and the re-run after a save that overlapped new typing. */
  const again = useRef<() => void>(() => undefined);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (saving.current || !Object.keys(dirty.current).length) return;
    const patch = dirty.current;
    dirty.current = {};
    saving.current = true;
    setState("saving");
    let ok = false;
    try {
      ok = await onSave(patch);
    } catch {
      ok = false;
    }
    saving.current = false;
    if (!ok) {
      // Keep the unsent answers for the next try; newer edits of the same field win.
      dirty.current = { ...patch, ...dirty.current };
      setState("error");
      timer.current = setTimeout(() => again.current(), 5000);
      return;
    }
    setState("saved");
    if (Object.keys(dirty.current).length) again.current();
  }, [onSave]);
  useEffect(() => {
    again.current = flush;
  }, [flush]);

  const change = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    dirty.current[id] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1000);
  };

  // Last chance to send what is typed when the tab is closed or hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  const visible = (id: string) => !hidden.includes(id);
  const all = BRIEF_SECTIONS.flatMap((s) => s.questions.map((x) => x.id)).filter(visible);
  const done = all.filter((id) => (answers[id] ?? "").trim()).length;
  useEffect(() => {
    onProgress?.(done, all.length);
  }, [done, all.length, onProgress]);

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-2 z-10 flex items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2 shadow-[var(--shadow)] backdrop-blur">
        <span className="text-xs font-medium tabular-nums">
          {ui.progress} {done} {ui.of} {all.length}
        </span>
        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-track">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} />
        </div>
        <span className={cn("w-28 text-right text-xs", state === "error" ? "text-negative" : "text-muted-foreground")} aria-live="polite">
          {state === "saving" ? ui.saving : state === "saved" ? `✓ ${ui.saved}` : state === "error" ? ui.saveError : ""}
        </span>
      </div>

      {BRIEF_SECTIONS.map((section) => {
        const questions = section.questions.filter((x) => showHidden || visible(x.id));
        if (!questions.length) return null;
        return (
          <section key={section.id} className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-6">
            <h2 className="section-title">{section.title[lang]}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {ui.goal}: {section.goal[lang]}
            </p>
            <div className="mt-4 flex flex-col gap-5">
              {questions.map((item) => {
                const off = !visible(item.id);
                return (
                  <div key={item.id} className={cn("flex flex-col gap-1.5", off && "opacity-45")}>
                    <label htmlFor={`q-${item.id}`} className="text-sm font-medium leading-5">
                      {item.q[lang]}
                    </label>
                    <textarea
                      id={`q-${item.id}`}
                      rows={Math.min(8, Math.max(2, Math.ceil((answers[item.id] ?? "").length / 90)))}
                      className="field resize-y"
                      placeholder={ui.placeholder}
                      value={answers[item.id] ?? ""}
                      disabled={readOnly}
                      onChange={(e) => change(item.id, e.target.value)}
                      onBlur={flush}
                    />
                    {renderExtra?.(item.id)}
                  </div>
                );
              })}
              {section.files && filesSlot}
            </div>
          </section>
        );
      })}
    </div>
  );
}
