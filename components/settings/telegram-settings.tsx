"use client";

import { useState, useTransition } from "react";
import { saveMyTelegramAction } from "@/app/(dashboard)/settings/totem-actions";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/** «Мой Telegram»: where the person's deadline reminders and project-score news arrive. */
export function TelegramSettings({
  username,
  linked,
  botUsername,
  configured,
}: {
  username: string | null;
  linked: boolean;
  botUsername: string | null;
  configured: boolean;
}) {
  const [value, setValue] = useState(username ? `@${username}` : "");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () =>
    start(async () => {
      setMessage(null);
      try {
        const r = await saveMyTelegramAction(value);
        setMessage({ ok: r.ok, text: r.message });
      } catch {
        setMessage({ ok: false, text: "Не получилось сохранить." });
      }
    });

  return (
    <Card className="min-w-0">
      <h2 className="section-title">Мой Telegram</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Напоминания о дедлайнах задач (за день и при просрочке) и новости, когда меняется оценка твоих проектов.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input className="field max-w-xs" value={value} placeholder="@username" autoComplete="off" onChange={(e) => setValue(e.target.value)} />
        <button type="button" className="btn-primary" disabled={pending} onClick={save}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        {botUsername && username && !linked && (
          <a className="btn-ghost border border-border" href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">
            Открыть бота и нажать Start
          </a>
        )}
      </div>
      <p className="mt-2 text-xs">
        {!configured ? (
          <span className="text-muted-foreground">Бот уведомлений ещё не подключён администратором.</span>
        ) : !username ? (
          <span className="text-muted-foreground">Telegram не указан — уведомления не приходят.</span>
        ) : linked ? (
          <span className="font-medium text-positive">Подключён — уведомления приходят.</span>
        ) : (
          <span className="font-medium text-warning">Ждёт Start: откройте бота{botUsername ? ` @${botUsername}` : ""} и нажмите Start.</span>
        )}
      </p>
      {message && <p className={cn("mt-1 text-sm", message.ok ? "text-positive" : "text-negative")}>{message.text}</p>}
    </Card>
  );
}
