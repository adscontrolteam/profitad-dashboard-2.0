"use client";

import { useState, useTransition } from "react";
import { draftKickoffAction, sendKickoffAction } from "@/app/(dashboard)/inputs/kickoff-actions";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/cn";

/** Стартовое сообщение проекта: собрать из брифа и «Вводных», прочитать, поправить и отправить в Telegram-чат. */
export function KickoffMessage({
  projectId,
  chat,
  telegramReady,
  sentAt,
}: {
  projectId: string;
  /** Telegram chat id of the project, or null when it is not set in «Вводные». */
  chat: string | null;
  telegramReady: boolean;
  /** When the last kickoff message was sent, if ever. */
  sentAt: string | null;
}) {
  const [text, setText] = useState("");
  const [gaps, setGaps] = useState<string[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [withDigest, setWithDigest] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [, start] = useTransition();
  const canSend = telegramReady && Boolean(chat);
  const parts = Math.max(1, Math.ceil(text.length / 4096));

  const draft = () => {
    if (text.trim() && !window.confirm("Собрать заново? Ваши правки в тексте пропадут.")) return;
    setBusy("draft");
    setNote(null);
    start(async () => {
      const r = await draftKickoffAction(projectId);
      if (r.ok) {
        setText(r.text);
        setGaps(r.gaps);
        setWithDigest(r.withDigest);
      } else setNote({ ok: false, text: r.message });
      setBusy(null);
    });
  };
  const send = () => {
    if (!window.confirm(`Отправить сообщение в Telegram-чат проекта (${chat})? Отменить отправку нельзя.`)) return;
    setBusy("send");
    setNote(null);
    start(async () => {
      const r = await sendKickoffAction(projectId, text);
      setNote({ ok: r.ok, text: r.message });
      setBusy(null);
    });
  };

  return (
    <section id="kickoff" className="flex scroll-mt-24 flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title flex items-center gap-2">
          Стартовое сообщение в чат
          <InfoHint>
            Вводное сообщение для рабочего чата проекта: о проекте, KPI и бюджет первого месяца, источники трафика, что уже есть, команда и все
            ссылки. Цифры и ссылки берутся из «Вводных», а «О проекте» и «Что есть на сейчас» пересказывает ИИ по брифу клиента. Перед отправкой
            текст можно прочитать и поправить.
          </InfoHint>
        </h2>
        <span className="text-xs text-muted-foreground">
          {sentAt
            ? `отправляли ${new Date(sentAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : "ещё не отправляли"}
        </span>
      </div>

      {text ? (
        <>
          {gaps.length > 0 && (
            <p className="rounded-[14px] border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5">
              Стоит заполнить перед отправкой: {gaps.join(", ")}.
            </p>
          )}
          {!withDigest && (
            <p className="text-xs text-muted-foreground">Пересказ брифа не собран (бриф пуст или ИИ недоступен) — в сообщении только данные из «Вводных».</p>
          )}
          <textarea
            className="field min-h-[420px] font-mono text-[13px] leading-5"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Текст стартового сообщения"
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {text.length} знаков{parts > 1 ? ` · уйдёт ${parts} сообщениями (лимит Telegram — 4096 знаков)` : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Нажмите «Собрать сообщение» — текст появится здесь, его можно поправить перед отправкой.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={text ? "btn-ghost border border-border px-3 py-1.5" : "btn-primary"} disabled={busy !== null} onClick={draft}>
          {busy === "draft" ? "Собираю…" : text ? "Собрать заново" : "Собрать сообщение"}
        </button>
        {text && (
          <>
            <button type="button" className="btn-primary" disabled={busy !== null || !canSend || !text.trim()} onClick={send}>
              {busy === "send" ? "Отправляю…" : "Отправить в чат"}
            </button>
            <button
              type="button"
              className="btn-ghost border border-border px-3 py-1.5"
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Скопировано ✓" : "Скопировать"}
            </button>
          </>
        )}
        {note && <span className={cn("text-sm", note.ok ? "text-positive" : "text-negative")}>{note.text}</span>}
      </div>
      {!canSend && (
        <p className="text-xs text-muted-foreground">
          {!chat
            ? "Чтобы отправлять из дашборда, укажите Telegram-чат проекта: «Вводные» → проект → «Telegram-чат проекта». Пока текст можно скопировать."
            : "Telegram не подключён к дашборду (нет TELEGRAM_BOT_TOKEN в Vercel). Пока текст можно скопировать и отправить вручную."}
        </p>
      )}
    </section>
  );
}
