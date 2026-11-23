"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refreshProjectLeadsAction } from "@/app/(dashboard)/sync-actions";

/**
 * Re-reads the project's lead sheet when the page opens or the tab gets focus again, then reloads the numbers.
 * The server skips the work if the sheet was read in the last couple of minutes.
 */
export function AutoRefresh({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    const run = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      setBusy(true);
      try {
        const r = await refreshProjectLeadsAction(projectId);
        if (!cancelled && r.refreshed) router.refresh();
      } catch {
        // offline or signed out: the page keeps what it has
      } finally {
        running = false;
        if (!cancelled) setBusy(false);
      }
    };
    run();
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [projectId, router]);

  if (!busy) return null;
  return (
    <p className="fixed bottom-4 right-4 z-40 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-[var(--shadow)]" role="status">
      Обновляю данные из таблицы…
    </p>
  );
}
