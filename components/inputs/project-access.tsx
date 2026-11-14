"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncAccessAction } from "@/app/(dashboard)/inputs/actions";
import { cn } from "@/lib/cn";

export interface AccessView {
  service: string;
  email: string;
  status: string;
  error: string | null;
  role: string;
  target: string;
}

const LABEL: Record<string, string> = {
  drive: "Папка Drive",
  google_ads: "Google Ads",
  ga4: "Google Analytics 4",
  gtm: "Google Tag Manager",
  meta: "Meta Ads",
  clarity: "Clarity",
  search_console: "Search Console",
  telegram: "Telegram-чат",
};

const STATUS: Record<string, { label: string; className: string }> = {
  granted: { label: "выдан", className: "text-positive" },
  existing: { label: "уже был", className: "text-muted-foreground" },
  task: { label: "задача на выдачу", className: "text-warning" },
  failed: { label: "не выдан", className: "text-negative" },
  revoked: { label: "забран", className: "text-muted-foreground" },
  revoke_task: { label: "задача забрать", className: "text-warning" },
};

/** What the specialists got in the project's services, and a button to re-run the grants. */
export function ProjectAccess({ projectId, items }: { projectId: string; items: AccessView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const current = items.filter((i) => !["revoked", "revoke_task"].includes(i.status) || i.error);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Доступы специалистов</span>
        <button
          type="button"
          className="btn-ghost border border-border px-3 py-1 text-xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await syncAccessAction(projectId);
              setResult(r);
              router.refresh();
            })
          }
        >
          {pending ? "Обновляю…" : "Обновить доступы"}
        </button>
      </div>
      {current.length === 0 ? (
        <span className="text-xs text-muted-foreground">Пока ничего не выдано: назначьте ответственных и сохраните проект.</span>
      ) : (
        <ul className="flex flex-col gap-1.5 text-xs">
          {current.map((i) => (
            <li key={`${i.service}|${i.target}|${i.email}`} className="flex flex-col">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{LABEL[i.service] ?? i.service}</span>
                <span className="text-muted-foreground">{i.email}</span>
                <span className={cn("ml-auto", STATUS[i.status]?.className)}>{STATUS[i.status]?.label ?? i.status}</span>
              </span>
              {i.error && <span className="text-negative/90 [overflow-wrap:anywhere]">{i.error}</span>}
            </li>
          ))}
        </ul>
      )}
      {result && <span className={cn("text-xs", result.ok ? "text-positive" : "text-negative")}>{result.message}</span>}
    </div>
  );
}
