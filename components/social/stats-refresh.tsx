"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshSocialStatsAction } from "@/app/(dashboard)/smm/connect-actions";

/** Pulls the project's Facebook and Instagram numbers now and shows the fresh page. */
export function StatsRefresh({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="shrink-0 underline decoration-dotted underline-offset-4 hover:text-foreground disabled:opacity-60"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await refreshSocialStatsAction(projectId);
            setNote(res.ok ? null : (res.error ?? "Не удалось обновить."));
            router.refresh();
          })
        }
      >
        {pending ? "Обновляем…" : "Обновить"}
      </button>
      {note && <span className="text-negative">{note}</span>}
    </>
  );
}
