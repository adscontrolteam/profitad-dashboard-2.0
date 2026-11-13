"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmented, Toast } from "@/components/workspace/form";
import { useLocalState } from "@/components/workspace/use-local-state";
import { cn } from "@/lib/cn";
import { SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/workspace/params";
import { NetworkIcon } from "./network-icon";
import { postTitle, seedPosts, STATUS_META, type PostStatus, type SocialPost } from "./types";

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

type View = "scheduled" | "published" | "failed" | "draft";

export function PostingQueue({
  projectId,
  projectName,
  contentHref,
}: {
  projectId: string;
  projectName: string;
  contentHref: string;
}) {
  const [posts, setPosts] = useLocalState<SocialPost[]>(`posts:${projectId}`, seedPosts(projectName));
  const [view, setView] = useState<View>("scheduled");
  const [net, setNet] = useState<SocialNetwork | "all">("all");
  const [day, setDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const week = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  const scheduled = posts.filter((p) => p.status === "scheduled" && p.scheduledAt);
  const counts: Record<View, number> = {
    scheduled: scheduled.length,
    published: posts.filter((p) => p.status === "published").length,
    failed: posts.filter((p) => p.status === "failed").length,
    draft: posts.filter((p) => p.status === "draft").length,
  };

  const shown = posts
    .filter((p) => p.status === view)
    .filter((p) => net === "all" || p.network === net)
    .filter((p) => !day || (p.scheduledAt && new Date(p.scheduledAt).toDateString() === day))
    .sort((a, b) => {
      const ka = a.scheduledAt ?? a.publishedAt ?? a.createdAt;
      const kb = b.scheduledAt ?? b.publishedAt ?? b.createdAt;
      return view === "scheduled" ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });

  const patch = (id: string, p: Partial<SocialPost>) => setPosts((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const statusTabs: { value: View; label: string }[] = [
    { value: "scheduled", label: `Запланировано · ${counts.scheduled}` },
    { value: "published", label: `Опубликовано · ${counts.published}` },
    { value: "failed", label: `Ошибки · ${counts.failed}` },
    { value: "draft", label: `Черновики · ${counts.draft}` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-7 gap-1.5 sm:gap-3">
        {week.map((d) => {
          const key = d.toDateString();
          const items = scheduled.filter((p) => new Date(p.scheduledAt!).toDateString() === key);
          const active = day === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setDay(active ? null : key);
                setView("scheduled");
              }}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1.5 rounded-[18px] border px-1 py-3 transition-colors",
                active ? "border-transparent bg-accent text-accent-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              <span className="text-[11px] capitalize opacity-80">{fmtDay(d)}</span>
              <span className="text-xl font-bold tabular-nums">{items.length}</span>
              <span className="flex flex-wrap justify-center gap-0.5">
                {items.slice(0, 4).map((p) => (
                  <NetworkIcon key={p.id} network={p.network} className="size-3" />
                ))}
              </span>
            </button>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={view} onChange={(v) => { setView(v); setDay(null); }} options={statusTabs} />
        <select aria-label="Соцсеть" className="field w-auto" value={net} onChange={(e) => setNet(e.target.value as SocialNetwork | "all")}>
          <option value="all">Все соцсети</option>
          {SOCIAL_NETWORKS.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[var(--shadow)]">
        {shown.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-6 text-sm text-muted-foreground">
            <span>{day ? "На этот день ничего не запланировано." : "Здесь пока пусто."}</span>
            <Link href={contentHref} className="btn-primary">
              Создать пост
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((p) => {
              const when = p.scheduledAt ?? p.publishedAt;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <NetworkIcon network={p.network} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-sm font-semibold">{postTitle(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.account}
                      {p.parts.length > 1 ? ` · тред из ${p.parts.length} частей` : ""}
                      {p.fileName ? ` · ${p.fileName}` : ""}
                    </p>
                  </div>
                  {when && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(when).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, {fmtTime(when)}
                    </span>
                  )}
                  <StatusPill status={p.status} />
                  <div className="flex flex-wrap items-center gap-1">
                    {editing === p.id ? (
                      <input
                        type="datetime-local"
                        className="field w-auto py-1 text-xs"
                        defaultValue={toLocalInput(p.scheduledAt ?? new Date().toISOString())}
                        onBlur={(e) => {
                          if (e.target.value) patch(p.id, { status: "scheduled", scheduledAt: new Date(e.target.value).toISOString() });
                          setEditing(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      (p.status === "scheduled" || p.status === "failed") && (
                        <>
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1 text-xs"
                            onClick={() => {
                              patch(p.id, { status: "published", publishedAt: new Date().toISOString(), scheduledAt: null });
                              setToast("Опубликовано — демо, реальная отправка после подключения API.");
                            }}
                          >
                            {p.status === "failed" ? "Повторить" : "Опубликовать сейчас"}
                          </button>
                          <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(p.id)}>
                            Перенести
                          </button>
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1 text-xs text-negative hover:text-negative"
                            onClick={() => patch(p.id, { status: "draft", scheduledAt: null })}
                          >
                            В черновики
                          </button>
                        </>
                      )
                    )}
                    {p.status === "draft" && (
                      <Link href={contentHref} className="btn-ghost px-3 py-1 text-xs">
                        Открыть в редакторе
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function StatusPill({ status }: { status: PostStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS_META[status].className)}>
      {STATUS_META[status].label}
    </span>
  );
}
