"use client";

import { useRef, useState } from "react";
import { Field, Segmented, Toast } from "@/components/workspace/form";
import { uid, useLocalState } from "@/components/workspace/use-local-state";
import { cn } from "@/lib/cn";
import { SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/workspace/params";
import { NetworkIcon } from "./network-icon";
import {
  demoAccounts,
  NEEDS_MEDIA,
  postTitle,
  seedPosts,
  STATUS_META,
  TEXT_LIMITS,
  type SocialPost,
} from "./types";

type When = "now" | "slot" | "custom";

const dayKey = (iso: string) => new Date(iso).toDateString();

function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/** Next free «best» slot: 19:00 today or tomorrow. */
function bestSlot() {
  const d = new Date();
  if (d.getHours() >= 18) d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return d;
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Placeholder for the writing agent: splits a topic into a post in the brand voice. */
function agentDraft(topic: string, network: SocialNetwork): string[] {
  const t = topic.trim();
  if (network !== "threads") {
    return [`${t}\n\nРассказываем коротко и по делу — что изменилось и что с этим делать. Сохраняй, чтобы не потерять 👇`];
  }
  return [
    t,
    "Почему это важно: правила игры меняются, и выигрывает тот, кто проверяет первым.",
    "Что делать уже сейчас: протестировать на небольшом бюджете и сравнить с текущими результатами.",
    "А вы уже пробовали? Расскажите в ответах, что получилось.",
  ];
}

function agentRewrite(text: string) {
  const t = text.trim();
  if (!t) return t;
  return t.endsWith("?") || t.endsWith("!") ? t : `${t.replace(/\.$/, "")} — проверено на практике.`;
}

export function ContentStudio({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [mode, setMode] = useState<"posts" | "montage">("posts");
  const [posts, setPosts] = useLocalState<SocialPost[]>(`posts:${projectId}`, seedPosts(projectName));
  const [openId, setOpenId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [topicNet, setTopicNet] = useState<SocialNetwork>("threads");
  const [toast, setToast] = useState<string | null>(null);

  const drafts = posts
    .filter((p) => p.status === "draft" || p.status === "failed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, SocialPost[]>();
  for (const p of drafts) {
    const k = dayKey(p.createdAt);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const open = posts.find((p) => p.id === openId) ?? null;

  const create = (network: SocialNetwork, parts: string[], source: SocialPost["source"]) => {
    const post: SocialPost = {
      id: uid(),
      network,
      account: demoAccounts(projectName, network)[0],
      parts,
      title: "",
      fileName: null,
      status: "draft",
      source,
      scheduledAt: null,
      publishedAt: null,
      createdAt: new Date().toISOString(),
    };
    setPosts((list) => [post, ...list]);
    setOpenId(post.id);
  };

  const update = (next: SocialPost) => setPosts((list) => list.map((p) => (p.id === next.id ? next : p)));

  return (
    <div className="flex flex-col gap-5">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "posts", label: "Посты и треды" },
          { value: "montage", label: "Монтаж видео" },
        ]}
      />

      {mode === "montage" ? (
        <Montage onDone={setToast} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] xl:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <form
              className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--shadow)] sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                if (!topic.trim()) return;
                create(topicNet, agentDraft(topic, topicNet), "Агент");
                setTopic("");
              }}
            >
              <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">✦ Агент</span>
              <input
                className="field min-w-0 flex-1 border-transparent bg-transparent"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Тема или мысль — агент напишет пост вашим голосом"
              />
              <select
                aria-label="Соцсеть"
                className="field w-auto"
                value={topicNet}
                onChange={(e) => setTopicNet(e.target.value as SocialNetwork)}
              >
                {SOCIAL_NETWORKS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary shrink-0" disabled={!topic.trim()}>
                Написать
              </button>
            </form>

            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="section-title">Черновики</h2>
              <button type="button" className="btn-ghost border border-border" onClick={() => create("threads", [""], "Вручную")}>
                + Новый пост
              </button>
            </div>

            {drafts.length === 0 && (
              <p className="rounded-[var(--radius)] border border-border bg-card p-6 text-sm text-muted-foreground">
                Черновиков нет. Опишите тему агенту или создайте пост вручную.
              </p>
            )}

            {[...groups.entries()].map(([key, items]) => (
              <section key={key} className="flex flex-col gap-2">
                <p className="px-1 text-sm font-semibold">
                  {groupLabel(items[0].createdAt)} <span className="text-muted-foreground">{items.length}</span>
                </p>
                <ul className="flex flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-[var(--shadow)]">
                  {items.map((p) => (
                    <li key={p.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setOpenId(p.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                          openId === p.id && "bg-muted",
                        )}
                      >
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {p.source}
                        </span>
                        <NetworkIcon network={p.network} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm">{postTitle(p)}</span>
                        {p.status === "failed" && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_META.failed.className)}>
                            ошибка
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {open ? (
            <PostEditor
              key={open.id}
              post={open}
              projectName={projectName}
              onChange={update}
              onClose={() => setOpenId(null)}
              onDelete={() => {
                setPosts((list) => list.filter((p) => p.id !== open.id));
                setOpenId(null);
              }}
              onPublished={(msg) => {
                setOpenId(null);
                setToast(msg);
              }}
            />
          ) : (
            <aside className="hidden rounded-[var(--radius)] border border-dashed border-border p-8 text-center text-sm text-muted-foreground xl:block">
              Выберите черновик слева, чтобы отредактировать и опубликовать.
            </aside>
          )}
        </div>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function PostEditor({
  post,
  projectName,
  onChange,
  onClose,
  onDelete,
  onPublished,
}: {
  post: SocialPost;
  projectName: string;
  onChange: (p: SocialPost) => void;
  onClose: () => void;
  onDelete: () => void;
  onPublished: (message: string) => void;
}) {
  const [when, setWhen] = useState<When>("now");
  const [custom, setCustom] = useState(() => toLocalInput(bestSlot()));
  const fileRef = useRef<HTMLInputElement>(null);
  const limit = TEXT_LIMITS[post.network];
  const isThread = post.network === "threads";
  const accounts = demoAccounts(projectName, post.network);

  const set = (patch: Partial<SocialPost>) => onChange({ ...post, ...patch });
  const setPart = (i: number, text: string) => set({ parts: post.parts.map((p, j) => (j === i ? text : p)) });

  const switchNetwork = (network: SocialNetwork) =>
    set({
      network,
      account: demoAccounts(projectName, network)[0],
      parts: network === "threads" ? post.parts : [post.parts.filter(Boolean).join("\n\n")],
    });

  const problems = [
    post.parts.every((p) => !p.trim()) ? "Добавьте текст" : null,
    post.parts.some((p) => p.length > limit) ? `Текст длиннее ${limit} символов` : null,
    NEEDS_MEDIA[post.network] && !post.fileName ? "Для этой соцсети нужно видео или фото" : null,
    post.network === "youtube" && !post.title.trim() ? "Добавьте название видео" : null,
    when === "custom" && new Date(custom) <= new Date() ? "Время публикации уже прошло" : null,
  ].filter(Boolean) as string[];

  const publish = () => {
    if (problems.length) return;
    const network = SOCIAL_NETWORKS.find((n) => n.id === post.network)?.label;
    if (when === "now") {
      onChange({ ...post, status: "published", publishedAt: new Date().toISOString(), scheduledAt: null });
      onPublished(`Опубликовано в ${network} (${post.account}) — демо, реальная отправка после подключения API.`);
    } else {
      const at = when === "slot" ? bestSlot() : new Date(custom);
      onChange({ ...post, status: "scheduled", scheduledAt: at.toISOString() });
      onPublished(
        `Запланировано: ${network}, ${at.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Видно во вкладке «Постинг».`,
      );
    }
  };

  return (
    <aside className="flex min-w-0 flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{post.source}</span>
          <h2 className="mt-2 line-clamp-3 text-base font-bold tracking-[-0.02em]">{postTitle(post)}</h2>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost size-8 shrink-0 p-0" aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SOCIAL_NETWORKS.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => switchNetwork(n.id)}
            aria-pressed={n.id === post.network}
            title={n.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              n.id === post.network ? "border-transparent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <NetworkIcon network={n.id} className="size-3.5" />
            {n.label}
          </button>
        ))}
      </div>

      {post.network === "youtube" && (
        <Field label="Название видео">
          <input className="field" value={post.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      )}

      {post.parts.map((text, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">
              {isThread ? (i === 0 ? "Главный пост" : `Часть ${i + 1}`) : post.network === "youtube" ? "Описание" : "Текст"}
              <span className={cn("ml-2 font-normal tabular-nums", text.length > limit ? "text-negative" : "text-muted-foreground")}>
                {text.length} / {limit}
              </span>
            </span>
            {isThread && post.parts.length > 1 && (
              <button
                type="button"
                className="text-muted-foreground hover:text-negative"
                aria-label={`Удалить часть ${i + 1}`}
                onClick={() => set({ parts: post.parts.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            )}
          </div>
          <textarea className="field min-h-24 resize-y" value={text} onChange={(e) => setPart(i, e.target.value)} />
        </div>
      ))}
      {isThread && (
        <button type="button" className="btn-ghost w-fit border border-border px-3 py-1.5 text-xs" onClick={() => set({ parts: [...post.parts, ""] })}>
          + Часть
        </button>
      )}

      {post.network !== "threads" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Медиа {NEEDS_MEDIA[post.network] ? "" : "(необязательно)"}</span>
          <div className="flex items-center gap-2 rounded-[16px] border border-dashed border-border pr-3 hover:bg-muted/50">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="min-w-0 flex-1 truncate px-4 py-3 text-left text-sm"
            >
              {post.fileName ?? "Выбрать видео или фото"}
            </button>
            {post.fileName && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-negative"
                onClick={() => set({ fileName: null })}
              >
                убрать
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) set({ fileName: file.name });
            }}
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold">Канал</legend>
        {accounts.map((acc) => (
          <label
            key={acc}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[16px] border px-3 py-2.5 text-sm transition-colors",
              post.account === acc ? "border-ring bg-muted" : "border-border hover:bg-muted/50",
            )}
          >
            <input type="radio" name="account" checked={post.account === acc} onChange={() => set({ account: acc })} className="accent-[var(--accent)]" />
            <NetworkIcon network={post.network} className="size-4" />
            <span className="font-medium">{acc}</span>
            <span className="text-xs text-muted-foreground">{projectName}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold">Когда</span>
        <Segmented
          value={when}
          onChange={setWhen}
          options={[
            { value: "now", label: "Сразу" },
            {
              value: "slot",
              label: `Лучший слот (${bestSlot().toLocaleString("ru-RU", { weekday: "short", hour: "2-digit", minute: "2-digit" })})`,
            },
            { value: "custom", label: "Выбрать время" },
          ]}
        />
        {when === "custom" && (
          <input type="datetime-local" className="field" value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
      </div>

      {problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {problems.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button type="button" className="btn-primary" disabled={problems.length > 0} onClick={publish}>
          {when === "now" ? "Опубликовать" : "Запланировать"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => set({ parts: post.parts.map(agentRewrite) })}>
          ✦ Агент перепишет
        </button>
        <button type="button" className="btn-ghost ml-auto text-negative hover:text-negative" onClick={onDelete}>
          Удалить
        </button>
      </div>
    </aside>
  );
}

function Montage({ onDone }: { onDone: (msg: string) => void }) {
  const [file, setFile] = useState<string | null>(null);
  const [pace, setPace] = useState<"normal" | "calm">("normal");
  const [wishes, setWishes] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  return (
    <section className="flex flex-col gap-5 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
      <div>
        <h2 className="section-title">Монтаж</h2>
        <p className="mt-1 text-sm text-muted-foreground">Агент вырежет паузы и слова-паразиты, ускорит, добавит субтитры и обложку.</p>
      </div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) setFile(f.name);
        }}
        className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-border px-4 text-center hover:bg-muted/50"
      >
        <span className="text-base font-semibold">{file ?? "Перетащите сырое видео сюда"}</span>
        <span className="text-xs text-muted-foreground">или нажмите, чтобы выбрать (MP4 / MOV с телефона)</span>
      </button>
      <input ref={ref} type="file" accept="video/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
      <Segmented
        value={pace}
        onChange={setPace}
        options={[
          { value: "normal", label: "Обычный (1.2×, плотно)" },
          { value: "calm", label: "Размышление (мягко, 1.15×)" },
        ]}
      />
      <Field label="Пожелания" hint="— необязательно">
        <textarea
          className="field min-h-20"
          value={wishes}
          onChange={(e) => setWishes(e.target.value)}
          placeholder="Например: убери кусок про цены, обложка — «38 кампаний за вечер»"
        />
      </Field>
      <div>
        <button
          type="button"
          className="btn-primary"
          disabled={!file}
          onClick={() => {
            onDone(`«${file}» отправлено на монтаж — демо. Готовый ролик появится в черновиках после подключения агента.`);
            setFile(null);
            setWishes("");
          }}
        >
          Смонтировать
        </button>
      </div>
    </section>
  );
}
