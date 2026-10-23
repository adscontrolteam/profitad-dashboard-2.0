"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import {
  DEFAULT_THEME_PREFERENCE,
  readThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemeId,
  type ThemePreference,
} from "@/lib/theme";

const PREVIEW: Record<ThemeId, { sidebar: string; canvas: string; card: string; accent: string }> = {
  light: { sidebar: "#ffffff", canvas: "#f3f4f2", card: "#ffffff", accent: "#12283a" },
  dark: { sidebar: "#161616", canvas: "#0b0b0b", card: "#141414", accent: "#b9ef1c" },
};

const OPTIONS: { id: ThemePreference; name: string; description: string }[] = [
  { id: "system", name: "Как в системе", description: "Подстраивается под тему устройства автоматически" },
  { id: "light", name: "Светлая", description: "Всегда светлое оформление" },
  { id: "dark", name: "Тёмная", description: "Всегда тёмное оформление" },
];

export function ThemePicker() {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => DEFAULT_THEME_PREFERENCE,
  );

  return (
    <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Тема оформления">
      {OPTIONS.map((option) => {
        const selected = option.id === preference;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setThemePreference(option.id)}
            className={cn(
              "rounded-[var(--radius)] border p-3 text-left transition-shadow",
              selected
                ? "border-ring shadow-[var(--shadow)] ring-2 ring-ring/30"
                : "border-border hover:border-ring/40",
            )}
          >
            <div className="flex h-[88px] overflow-hidden rounded-[16px]" aria-hidden="true">
              {option.id === "system" ? (
                <>
                  <Preview theme="light" />
                  <Preview theme="dark" />
                </>
              ) : (
                <Preview theme={option.id} />
              )}
            </div>
            <p className="mt-3 text-sm font-semibold tracking-[-0.02em]">{option.name}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}

function Preview({ theme }: { theme: ThemeId }) {
  const colors = PREVIEW[theme];
  return (
    <div className="flex flex-1" style={{ background: colors.canvas }}>
      <div className="m-2 w-8 rounded-full" style={{ background: colors.sidebar }} />
      <div className="flex flex-1 items-center gap-2 p-3">
        <div className="h-9 flex-1 rounded-full" style={{ background: colors.card }} />
        <div className="h-9 w-10 rounded-full" style={{ background: colors.accent }} />
      </div>
    </div>
  );
}
