"use client";

import Link from "next/link";
import { InfoHint } from "@/components/ui/info-hint";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { resolveLogAction } from "@/app/(dashboard)/log-actions";
import { Segmented } from "@/components/workspace/form";
import { cn } from "@/lib/cn";
import { byImpact, FOCUS, formatImpact, laneOf, type FocusKey } from "@/lib/log/focus";

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
  focus: FocusKey | null;
  impact: number | null;
  effortMin: number | null;
  rollback: string | null;
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
  panel = false,
  only = "all",
  currency = null,
  className,
}: {
  projectId: string;
  items: LogItem[];
  description?: string;
  /** On the project page the log mixes Реклама, SMM and project entries: label each. */
  showArea?: boolean;
  /** Project page: always open, a list that scrolls inside the block, with search by words. */
  panel?: boolean;
  /**
   * Two blocks side by side: «Лог» (where is the breakage) and «Фокус» (how to improve the result).
   * See laneOf in lib/log/focus.ts.
   */
  only?: "all" | "log" | "focus";
  /** Project currency, for the price of inaction of «Фокус» entries. */
  currency?: string | null;
  className?: string;
}) {
  const isFocus = only === "focus";
  const scoped = only === "all" ? items : items.filter((i) => laneOf(i) === only);
  const waiting = scoped.filter((i) => i.status === "needs_you").length;
  const [filter, setFilter] = useState<"needs_you" | "auto" | "all">(waiting ? "needs_you" : "all");
  // Always folded; the «Посмотреть Лог» link from Telegram (#log) opens it.
  const openedByLink = useSyncExternalStore(subscribeHash, () => window.location.hash === "#log", () => false);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = panel || (toggled ?? openedByLink);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const byStatus = filter === "all" ? scoped : scoped.filter((i) => i.status === filter);
  // Actions are read by cost: the dearest to leave undone comes first.
  const ordered = isFocus ? byImpact(byStatus) : byStatus;
  const shown = words.length
    ? ordered.filter((i) => {
        const text = `${i.title} ${i.body} ${i.resolutionNote ?? ""} ${KIND[i.kind]?.label ?? ""} ${AREA[i.area]}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
    : ordered;
  const list =
    shown.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        {words.length ? "По этим словам ничего не найдено." : filter === "needs_you" ? (isFocus ? "Новых идей для роста пока нет." : "Поломок и нарушений сейчас нет.") : "Записей пока нет."}
      </p>
    ) : (
      <ul className="flex flex-col divide-y divide-border">
        {shown.map((item) => (
          <LogRow key={item.id} projectId={projectId} item={item} showArea={showArea} currency={currency} />
        ))}
      </ul>
    );

  if (panel) {
    return (
      <section
        id={isFocus ? "focus" : "log"}
        className={cn(
          "flex min-h-0 min-w-0 scroll-mt-24 flex-col rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6",
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="section-title flex items-center gap-2">
            {isFocus ? "Фокус" : "Лог"}
            {waiting > 0 && (
              <span className="size-2.5 rounded-full bg-negative shadow-[0_0_0_3px_color-mix(in_oklab,var(--negative)_25%,transparent)]" title={`Ждёт вашего решения: ${waiting}`} aria-label={`Ждёт вашего решения: ${waiting}`} />
            )}
            <InfoHint>{description}</InfoHint>
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "needs_you", label: `Ждёт вас${waiting ? ` · ${waiting}` : ""}` },
                { value: "auto", label: "Авто" },
                { value: "all", label: "Все" },
              ]}
            />
            <button
              type="button"
              aria-label={isFocus ? "Поиск по фокусу" : "Поиск по логу"}
              aria-pressed={searching}
              title="Поиск по словам"
              onClick={() => {
                if (searching) setSearch("");
                setSearching(!searching);
              }}
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground",
                searching && "border-foreground/40 text-foreground",
              )}
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </div>
        </div>
        {searching && (
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Слова из записи: бюджет, лиды, доступ…"
            aria-label="Поиск по логу"
            className="field mt-3 text-sm"
          />
        )}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{list}</div>
      </section>
    );
  }

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
            <InfoHint caption="Что попадает в лог">{description}</InfoHint>
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
          {list}
        </div>
      )}
    </section>
  );
}

function LogRow({ projectId, item, showArea, currency }: { projectId: string; item: LogItem; showArea: boolean; currency: string | null }) {
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
        {item.focus && <span className={cn("rounded-full px-2 py-0.5 font-semibold", FOCUS[item.focus].className)}>{FOCUS[item.focus].label}</span>}
        <span className={cn("rounded-full px-2 py-0.5 font-medium", kind.className)}>{kind.label}</span>
        {showArea && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{AREA[item.area]}</span>}
        <span className="text-muted-foreground">{item.source === "agent" ? "агент" : "дашборд"}</span>
        <span className={cn("ml-auto font-medium", STATUS[item.status].className)}>{STATUS[item.status].label}</span>
      </div>
      <p className="text-sm font-semibold">{item.title}</p>
      {(item.impact !== null || item.effortMin !== null) && (
        <p className="text-xs text-muted-foreground">
          {item.impact !== null && (
            <>
              цена бездействия ≈ <span className="font-semibold text-foreground tabular-nums">{formatImpact(item.impact, currency)}</span> в неделю
            </>
          )}
          {item.impact !== null && item.effortMin !== null && " · "}
          {item.effortMin !== null && `займёт ≈ ${item.effortMin} мин`}
        </p>
      )}
      {item.body && <p className="whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>}
      {item.rollback && <p className="text-xs text-muted-foreground/80">Откат: {item.rollback}</p>}
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
