"use client";

import { useSyncExternalStore } from "react";

const dayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** «Пятница, 13 ноября · 13:24» */
function format(d: Date) {
  const day = dayFmt.format(d);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${timeFmt.format(d)}`;
}

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(id);
}

/** Day of week, date and time in the viewer's own time zone (rendered on the client only). */
export function LocalClock() {
  const text = useSyncExternalStore(
    subscribe,
    () => format(new Date()),
    () => null,
  );

  return (
    <span className="inline-flex min-h-9 items-center rounded-full border border-border bg-background/70 px-4 py-1.5 text-sm font-medium tabular-nums">
      {text ?? " "}
    </span>
  );
}
