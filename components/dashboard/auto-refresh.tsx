"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the open dashboard current. On opening it asks for the background refresh of all projects (the server does it
 * at most once per period, so asking is cheap) and re-reads the page when that has finished; after that the page is
 * re-read every few minutes while the tab is visible.
 * The request is made from the browser on purpose: started from the page's own render it would also run during the build.
 */
export function AutoRefresh({ everyMs = 5 * 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let gone = false;
    fetch("/api/cron/refresh", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ran?: boolean }) => {
        if (d.ran && !gone) router.refresh();
      })
      .catch(() => undefined);
    const timer = setInterval(() => document.visibilityState === "visible" && router.refresh(), everyMs);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [router, everyMs]);
  return null;
}
