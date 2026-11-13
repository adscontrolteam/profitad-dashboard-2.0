"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Demo-mode persistence: keeps drafts, schedules and campaigns in this browser
 * until the workspaces get their own tables and platform APIs.
 */
export function useLocalState<T>(key: string, initial: T) {
  const storageKey = `profitad:${key}`;
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      setValue(raw ? (JSON.parse(raw) as T) : initial);
    } catch {
      setValue(initial);
    }
    // initial is a fresh literal on every render; the key alone decides what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {
          // storage unavailable: keep in memory only
        }
        return resolved;
      });
    },
    [storageKey],
  );

  return [value, update] as const;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
