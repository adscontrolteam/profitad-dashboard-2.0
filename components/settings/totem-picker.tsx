"use client";

import { useState, useTransition } from "react";
import { saveTotemAction } from "@/app/(dashboard)/settings/totem-actions";
import { TotemCreature } from "@/components/profile/totem-creature";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { resolveTotem, TOTEM_COLORS, TOTEM_KINDS, type TotemChoice } from "@/lib/team/totem-kinds";

/** «Твой тотем» in Настройки: pick a creature and its colour; the preview shows it happy. */
export function TotemPicker({ seed, initial }: { seed: string; initial: TotemChoice | null }) {
  const start = resolveTotem(seed, initial);
  const [kind, setKind] = useState(start.kind.id);
  const [color, setColor] = useState(start.color.id);
  const [saved, setSaved] = useState({ kind: start.kind.id, color: start.color.id });
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = kind !== saved.kind || color !== saved.color;
  const choice = { kind, color };

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const r = await saveTotemAction(kind, color);
        if (r.ok) setSaved({ kind, color });
        setMessage({ ok: r.ok, text: r.message });
      } catch {
        setMessage({ ok: false, text: "Не получилось сохранить. Попробуйте ещё раз." });
      }
    });

  return (
    <Card className="min-w-0">
      <h2 className="section-title">Твой тотем</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Существо в профиле живёт твоими проектами: чем выше энергия, тем оно ярче и бодрее. Выбери, кто это будет.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center rounded-[22px] border border-border bg-muted/50 py-4">
          <TotemCreature seed={seed} choice={choice} mood="happy" size={150} className="text-foreground" />
          <span className="mt-1 text-sm font-semibold">{TOTEM_KINDS.find((k) => k.id === kind)?.label}</span>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Существо</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {TOTEM_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  aria-pressed={kind === k.id}
                  className={cn(
                    "flex flex-col items-center rounded-2xl border px-1 pb-2 pt-1 text-xs font-medium transition-colors",
                    kind === k.id ? "border-foreground bg-muted" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <TotemCreature seed={seed} choice={{ kind: k.id, color }} mood="happy" size={64} className="text-foreground [&_.totem-motion]:animate-none" />
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Цвет</p>
            <div className="flex flex-wrap gap-2">
              {TOTEM_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  aria-pressed={color === c.id}
                  title={c.label}
                  className={cn(
                    "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-medium transition-colors",
                    color === c.id ? "border-foreground bg-muted" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className="size-6 rounded-full border border-black/20" style={{ background: `hsl(${c.hue} 70% 60%)` }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={!dirty || pending} onClick={save}>
              {pending ? "Сохраняю…" : "Сохранить"}
            </button>
            {message && (
              <span className={cn("text-sm", message.ok ? "text-positive" : "text-negative")} aria-live="polite">
                {message.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
