"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { resolveLogAction } from "@/app/(dashboard)/log-actions";
import { Segmented } from "@/components/workspace/form";
import { cn } from "@/lib/cn";

export interface LogItem {
  id: string;
  at: string;
  source: string;
  kind: string;
  title: string;
  body: string;
  status: "auto" | "needs_you" | "done";
  area: "ads" | "smm" | "project";
  link: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

const KIND: Record<string, { label: string; className: string }> = {
  proposal: { label: "предложение", className: "bg-accent/40 text-foreground" },
  analysis: { label: "анализ", className: "bg-muted text-muted-foreground" },
  error: { label: "ошибка", className: "bg-negative/12 text-negative" },
  warning: { label: "внимание", className: "bg-warning/15 text-warning" },
  info: { label: "инфо", className: "bg-muted text-muted-foreground" },
};

const STATUS: Record<LogItem["status"], { label: string; className: string }> = {
  needs_you: { label: "Ждёт вашего решения", className: "text-warning" },
  auto: { label: "Решено автоматически", className: "text-positive" },
  done: { label: "Решено", className: "text-muted-foreground" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** Proposals, analysis, errors and warnings of the project — from the dashboard's checks and from the AI agent. */
const AREA: Record<LogItem["area"], string> = { ads: "реклама", smm: "SMM", project: "проект" };

export function ProjectLog({
  projectId,
  items,
  description = "Предложения, анализ и ошибки — от агента и от проверок дашборда.",
  showArea = false,
}: {
  projectId: string;
  items: LogItem[];
  description?: string;
  /** On the project page the log mixes Реклама, SMM and project entries: label each. */
  showArea?: boolean;
}) {
  const waiting = items.filter((i) => i.status === "needs_you").length;
  const [filter, setFilter] = useState<"needs_you" | "auto" | "all">(waiting ? "needs_you" : "all");
  // Always folded; the «Посмотреть Лог» link from Telegram (#log) opens it.
  const openedByLink = useSyncExternalStore(subscribeHash, () => window.location.hash === "#log", () => false);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = toggled ?? openedByLink;
  const shown = filter === "all" ? items : filter === "auto" ? items.filter((i) => i.status === "auto") : items.filter((i) => i.status === "needs_you");

  return (
    <section id="log" className="min-w-0 scroll-mt-24 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
      <button
        type="button"
        onClick={() => setToggled(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 text-left"
      >
        <h2 className="section-title flex items-center gap-2">
          Лог
          {waiting > 0 && (
            <span className="size-2.5 rounded-full bg-negative shadow-[0_0_0_3px_color-mix(in_oklab,var(--negative)_25%,transparent)]" title={`Ждёт вашего решения: ${waiting}`} aria-label={`Ждёт вашего решения: ${waiting}`} />
          )}
        </h2>
        <span className="text-xs text-muted-foreground">
          {waiting > 0 ? `ждёт вашего решения: ${waiting}` : items.length ? `записей: ${items.length}` : "пусто"}
        </span>
        <span className={cn("ml-auto text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden>
          ▾
        </span>
      </button>

      {expanded && (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{description}</p>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "needs_you", label: `Ждёт вашего решения${waiting ? ` · ${waiting}` : ""}` },
                { value: "auto", label: "Решено автоматически" },
                { value: "all", label: "Все" },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{filter === "needs_you" ? "Решений от вас сейчас не ждём." : "Записей пока нет."}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {shown.map((item) => (
                <LogRow key={item.id} projectId={projectId} item={item} showArea={showArea} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function LogRow({ projectId, item, showArea }: { projectId: string; item: LogItem; showArea: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const kind = KIND[item.kind] ?? KIND.info;

  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">{when(item.at)}</span>
        <span className={cn("rounded-full px-2 py-0.5 font-medium", kind.className)}>{kind.label}</span>
        {showArea && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{AREA[item.area]}</span>}
        <span className="text-muted-foreground">{item.source === "agent" ? "агент" : "дашборд"}</span>
        <span className={cn("ml-auto font-medium", STATUS[item.status].className)}>{STATUS[item.status].label}</span>
      </div>
      <p className="text-sm font-semibold">{item.title}</p>
      {item.body && <p className="whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>}
      {item.status !== "needs_you" && item.resolutionNote && (
        <p className="text-xs text-muted-foreground/80">
          → {item.resolutionNote}
          {item.resolvedBy && item.status === "done" ? ` · ${item.resolvedBy}` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {item.link &&
          (item.link.startsWith("/") ? (
            <Link href={item.link} className="btn-ghost border border-border px-3 py-1 text-xs">
              Открыть
            </Link>
          ) : (
            <a href={item.link} target="_blank" rel="noreferrer" className="btn-ghost border border-border px-3 py-1 text-xs">
              Открыть
            </a>
          ))}
        {item.status === "needs_you" && !open && (
          <button type="button" className="btn-ghost border border-border px-3 py-1 text-xs" onClick={() => setOpen(true)}>
            Решено
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <input className="field max-w-md text-sm" placeholder="Что сделали (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await resolveLogAction(projectId, item.id, note);
                if (r.ok) router.refresh();
                else setError(r.message);
              })
            }
          >
            {pending ? "Сохраняю…" : "Отметить решённым"}
          </button>
          <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>
            Отмена
          </button>
          {error && <span className="text-xs text-negative">{error}</span>}
        </div>
      )}
    </li>
  );
}
