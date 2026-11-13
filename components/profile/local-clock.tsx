"use client";

import { useSyncExternalStore } from "react";

const fmt = new Intl.DateTimeFormat("ru-RU", { weekday: "long", hour: "2-digit", minute: "2-digit" });

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(id);
}

/** Day of week and time in the viewer's own time zone (rendered on the client only). */
export function LocalClock() {
  const text = useSyncExternalStore(
    subscribe,
    () => fmt.format(new Date()),
    () => null,
  );

  return (
    <span className="inline-flex min-h-9 items-center rounded-full border border-border bg-background/70 px-4 py-1.5 text-sm font-medium capitalize tabular-nums">
      {text ?? " "}
    </span>
  );
}
