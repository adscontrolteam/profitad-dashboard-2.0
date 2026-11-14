"use client";

import { useCallback, useState, useTransition } from "react";
import { InfoHint } from "@/components/ui/info-hint";
import { rotateBriefLinkAction, saveBriefAnswersAdminAction, saveBriefSettingsAction } from "@/app/(dashboard)/inputs/brief-actions";
import { cn } from "@/lib/cn";
import { BRIEF_LANG_LABEL, BRIEF_LANGS, type BriefLang } from "@/lib/brief/questions";
import { BriefForm } from "./brief-form";

type Status = "draft" | "submitted" | "closed";
const STATUS: Record<Status, { label: string; className: string }> = {
  draft: { label: "Заполняется", className: "bg-muted text-muted-foreground" },
  submitted: { label: "Клиент отправил", className: "bg-positive/12 text-positive" },
  closed: { label: "Закрыт", className: "bg-warning/15 text-warning" },
};

/** Our side of the brief: the link for the client, language, which questions to ask, answers we fill in ourselves, internal notes. */
export function AdminBrief({
  projectId,
  origin,
  initial,
}: {
  projectId: string;
  origin: string;
  initial: {
    token: string;
    lang: BriefLang;
    status: Status;
    answers: Record<string, string>;
    notes: Record<string, string>;
    hidden: string[];
    files: string[];
    clientSeenAt: string | null;
    submittedAt: string | null;
  };
}) {
  const [token, setToken] = useState(initial.token);
  const [lang, setLang] = useState(initial.lang);
  const [status, setStatus] = useState(initial.status);
  const [hidden, setHidden] = useState(initial.hidden);
  const [notes, setNotes] = useState(initial.notes);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const link = `${origin}/brief/${token}`;
  const onSave = useCallback(async (patch: Record<string, string>) => (await saveBriefAnswersAdminAction(projectId, patch)).ok, [projectId]);
  const settings = (input: Parameters<typeof saveBriefSettingsAction>[1]) => start(async () => void (await saveBriefSettingsAction(projectId, input)));
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section-title">Ссылка для клиента</h2>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS[status].className)}>{STATUS[status].label}</span>
          <span className="text-xs text-muted-foreground">
            {initial.submittedAt ? `отправил ${fmt(initial.submittedAt)}` : initial.clientSeenAt ? `открывал ${fmt(initial.clientSeenAt)}` : "клиент ещё не открывал"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input readOnly className="field min-w-0 flex-1 text-sm" value={link} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Скопировано ✓" : "Скопировать"}
          </button>
          <a href={link} target="_blank" rel="noreferrer" className="btn-ghost border border-border px-3 py-1.5">
            Как видит клиент
          </a>
        </div>
        <InfoHint caption="Что видит клиент">По ссылке клиент заходит без регистрации и видит только бриф. Ваши заметки и выключенные вопросы ему не показываются. Ответы, которые вы
          заполните ниже, он увидит и сможет поправить.</InfoHint>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Язык брифа
            <select
              className="field w-auto"
              value={lang}
              onChange={(e) => {
                const v = e.target.value as BriefLang;
                setLang(v);
                settings({ lang: v });
              }}
            >
              {BRIEF_LANGS.map((l) => (
                <option key={l} value={l}>
                  {BRIEF_LANG_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-ghost border border-border px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => {
              const next: Status = status === "closed" ? "draft" : "closed";
              setStatus(next);
              settings({ status: next });
            }}
          >
            {status === "closed" ? "Открыть для правок" : "Закрыть бриф"}
          </button>
          <button
            type="button"
            className="btn-ghost border border-border px-3 py-1.5 text-xs text-negative"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Выдать новую ссылку? Старая перестанет работать.")) return;
              start(async () => {
                const r = await rotateBriefLinkAction(projectId);
                if (r.ok && r.token) setToken(r.token);
              });
            }}
          >
            Новая ссылка (отозвать старую)
          </button>
        </div>
        {initial.files.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Файлы от клиента ({initial.files.length}) — в папке проекта на Drive → «Бриф клиента»: {initial.files.slice(0, 8).join(", ")}
            {initial.files.length > 8 ? "…" : ""}
          </p>
        )}
      </section>

      <BriefForm
        key={lang}
        lang={lang}
        initial={initial.answers}
        hidden={hidden}
        showHidden
        onSave={onSave}
        renderExtra={(id) => {
          const off = hidden.includes(id);
          return (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="field min-w-0 flex-1 py-1.5 text-xs"
                placeholder="Заметка для нас (клиент не видит)"
                value={notes[id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [id]: e.target.value })}
                onBlur={(e) => settings({ notes: { [id]: e.target.value } })}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!off}
                  onChange={() => {
                    const next = off ? hidden.filter((h) => h !== id) : [...hidden, id];
                    setHidden(next);
                    settings({ hidden: next });
                  }}
                  className="size-4 accent-[var(--accent)]"
                />
                спрашивать клиента
              </label>
            </div>
          );
        }}
      />
    </div>
  );
}
