"use client";

import { useState, useTransition } from "react";
import { manychatHookAction } from "@/app/(dashboard)/inputs/manychat-actions";
import { InfoHint } from "@/components/ui/info-hint";

const body = (step: "start" | "lead") =>
  `{
  "step": "${step}",
  "keyword": "КОДОВОЕ СЛОВО",
  "subscriber_id": "{{Contact ID}}",
  "ig_username": "{{Instagram username}}",
  "last_input": "{{Last text input}}"
}`;

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost border border-border px-3 py-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "Скопировано ✓" : label}
    </button>
  );
}

/** «Вводные»: the address ManyChat automations report to, with the two request bodies to paste. */
export function ManychatConnect({ projectId }: { projectId: string }) {
  const [info, setInfo] = useState<{ url: string; count: number; lastAt: string | null } | null>(null);
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      const res = await manychatHookAction(projectId);
      if (res.ok && res.url) setInfo({ url: res.url, count: res.count ?? 0, lastAt: res.lastAt ?? null });
    });

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="section-kicker mb-2">
        ManyChat: воронки в сообщениях{" "}
        <InfoHint className="ml-1">
          В каждую автоматизацию ManyChat добавляются два действия «Make External Request»: одно сразу после триггера (запуск воронки), второе
          рядом с передачей лида в CRM. Они сообщают дашборду шаг и кодовое слово — из этого строится вкладка «Сообщения» в SMM.
        </InfoHint>
      </legend>
      {!info ? (
        <button type="button" className="btn-ghost self-start border border-border px-3 py-1.5 text-xs" disabled={pending} onClick={load}>
          {pending ? "Загружаем…" : "Показать адрес и инструкцию"}
        </button>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <input readOnly className="field min-w-0 flex-1 text-xs" value={info.url} onFocus={(e) => e.target.select()} aria-label="Адрес для ManyChat" />
            <Copy text={info.url} label="Скопировать адрес" />
          </div>
          <p className="text-xs text-muted-foreground">
            {info.count
              ? `Событий получено: ${info.count}. Последнее — ${new Date(info.lastAt!).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
              : "Событий пока не было. После настройки нажмите в ManyChat «Test Request» и обновите здесь."}{" "}
            <button type="button" className="underline decoration-dotted underline-offset-4" disabled={pending} onClick={load}>
              Обновить
            </button>
          </p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs leading-5 text-muted-foreground">
            <li>В автоматизации ManyChat: «+» → Action → Make External Request.</li>
            <li>Request type — POST, в Request URL вставьте адрес выше. В Headers: Content-Type = application/json.</li>
            <li>В Body вставьте текст для нужного шага и замените КОДОВОЕ СЛОВО на слово этой воронки. Поля в двойных скобках выберите из списка ManyChat.</li>
            <li>Первый блок ставится сразу после триггера, второй — рядом с передачей лида в CRM.</li>
            <li>Нажмите Test Request: в ответе должно быть «ok: true».</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Copy text={body("start")} label="Body: запуск воронки" />
            <Copy text={body("lead")} label="Body: передача лида" />
          </div>
        </div>
      )}
    </fieldset>
  );
}
