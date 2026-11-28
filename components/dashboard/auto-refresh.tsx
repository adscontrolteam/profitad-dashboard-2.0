"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps an open page current: re-reads its data shortly after it opens (the background refresh started by the visit
 * has finished by then) and then every few minutes while the tab is visible.
 */
export function AutoRefresh({ firstMs = 60_000, everyMs = 5 * 60_000 }: { firstMs?: number; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && router.refresh();
    const first = setTimeout(refresh, firstMs);
    const timer = setInterval(refresh, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [router, firstMs, everyMs]);
  return null;
}
