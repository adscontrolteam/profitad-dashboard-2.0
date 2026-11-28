"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { HEALTH_GREEN, HEALTH_YELLOW } from "@/lib/domain/health";
import type { Mood, TotemMember } from "@/lib/team/mood";
import { TotemCreature } from "./totem-creature";

const MOOD_LABEL: Record<Mood, string> = {
  fire: "Огонь",
  happy: "Доволен",
  ok: "Держится",
  sad: "Грустит",
  exhausted: "Выдохся",
  idle: "Отдыхает",
};

const MOOD_HINT: Record<Mood, string> = {
  fire: "Результаты идут, всё по плану — можно похвалить.",
  happy: "Дела идут хорошо.",
  ok: "Результат просел — человек под нагрузкой. Стоит спросить, чем помочь.",
  sad: "Проекты далеко от плана — нужна поддержка.",
  exhausted: "Результатов почти нет — поговорите с человеком сегодня.",
  idle: "Нет активных проектов с оценкой.",
};

const MOOD_TONE: Record<Mood, string> = {
  fire: "bg-accent text-accent-foreground",
  happy: "bg-positive/15 text-positive",
  ok: "bg-warning/15 text-warning",
  sad: "bg-negative/12 text-negative",
  exhausted: "bg-negative/20 text-negative",
  idle: "bg-muted text-muted-foreground",
};

const scoreTone = (score: number | null) =>
  score === null ? "text-muted-foreground" : score >= HEALTH_GREEN ? "text-positive" : score >= HEALTH_YELLOW ? "text-warning" : "text-negative";

const firstName = (m: TotemMember) => m.name?.split(/\s+/)[0] ?? m.email.split("@")[0];

/**
 * The team scene on the profile: the viewer's creature in front, everyone else's behind.
 * Whoever can manage access (admin) sees each person's score and the projects behind it, and can bring anyone forward.
 */
export function TotemStage({ members, viewerEmail, detailed }: { members: TotemMember[]; viewerEmail: string; detailed: boolean }) {
  const [focus, setFocus] = useState(viewerEmail);
  const main = members.find((m) => m.email === focus) ?? members.find((m) => m.email === viewerEmail) ?? members[0];
  if (!main) return null;
  const others = members.filter((m) => m.email !== main.email);
  const isMe = main.email === viewerEmail;
  const needHelp = members.filter((m) => m.mood === "sad" || m.mood === "exhausted").length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* Scene */}
      <div className="relative min-h-[300px] overflow-hidden rounded-[22px] border border-border bg-[radial-gradient(120%_90%_at_50%_100%,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_70%)] bg-muted/50 px-3 pt-4">
        {/* Everyone else, along the back */}
        <div className="relative z-0 flex items-end justify-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3">
          {others.map((m) => (
            <button
              key={m.email}
              type="button"
              onClick={() => setFocus(m.email)}
              disabled={!detailed}
              title={`${m.name ?? m.email} — ${MOOD_LABEL[m.mood]}${detailed && m.score !== null ? `, ${m.score}/100` : ""}`}
              className={cn(
                "group flex shrink-0 flex-col items-center rounded-2xl px-1 pt-1 transition-[opacity,transform] duration-200",
                detailed ? "cursor-pointer opacity-80 hover:-translate-y-1 hover:opacity-100" : "cursor-default opacity-75",
              )}
            >
              <TotemCreature seed={m.email} mood={m.mood} size={64} className="text-foreground" />
              <span className="mt-0.5 max-w-20 truncate text-[11px] font-medium text-muted-foreground group-hover:text-foreground">{firstName(m)}</span>
            </button>
          ))}
        </div>

        {/* The one in front */}
        <div className="relative z-10 mt-4 flex flex-col items-center pb-5">
          <TotemCreature key={main.email} seed={main.email} mood={main.mood} size={176} className="text-foreground drop-shadow-[0_10px_18px_rgba(0,0,0,0.12)]" />
          <span className="mt-1 rounded-full bg-card px-3 py-1 text-sm font-semibold shadow-[var(--shadow)]">
            {isMe ? "Ты" : main.name ?? main.email}
          </span>
        </div>
      </div>

      {/* What it means */}
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold tracking-[-0.02em]">{isMe ? "Твой тотем" : main.name ?? main.email}</h3>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", MOOD_TONE[main.mood])}>{MOOD_LABEL[main.mood]}</span>
          </div>
          {/* Own totem: just the energy. Someone else's (admin only): the energy and what it calls for. */}
          {main.score !== null && (isMe || detailed) ? (
            <p className="mt-2 flex items-baseline gap-2">
              <span className={cn("text-[40px] font-extrabold leading-none tracking-[-0.03em] tabular-nums", scoreTone(main.score))}>{main.score}</span>
              <span className="text-sm text-muted-foreground">из 100 · энергия</span>
            </p>
          ) : (
            isMe && <p className="mt-1.5 text-sm text-muted-foreground">Пока нет проектов с оценкой.</p>
          )}
          {!isMe && detailed && <p className="mt-2 text-sm leading-6 text-muted-foreground">{MOOD_HINT[main.mood]}</p>}
        </div>

        {(detailed || isMe) && main.projects.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{isMe ? "Где добавить фокуса" : "Проекты"}</p>
            <ul className="flex flex-col gap-1.5">
              {main.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2 text-sm transition-colors hover:bg-muted">
                    <span className="min-w-0 truncate font-medium">
                      {p.name}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{p.role}</span>
                    </span>
                    <span className={cn("shrink-0 font-bold tabular-nums", scoreTone(p.score))}>{p.score ?? "—"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {detailed && (
          <p className="mt-auto text-xs leading-5 text-muted-foreground">
            {needHelp > 0
              ? `Сейчас поддержка нужна: ${needHelp} ${needHelp === 1 ? "человеку" : "людям"}. `
              : "Сейчас у всех держится. "}
            Нажми на существо на фоне — покажет, что у человека по проектам. Состояние = средняя оценка его проектов (0–100).
          </p>
        )}
      </div>
    </div>
  );
}
