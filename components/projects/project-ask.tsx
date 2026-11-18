"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askProjectAction } from "@/app/(dashboard)/projects/ask-actions";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/cn";
import type { ChatTurn } from "@/lib/ai/ask";

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const usd = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** «Вопрос агенту»: a question about this project, answered from its brief, plan, ad numbers and log. */
export function ProjectAsk({
  projectId,
  projectName,
  initial,
  usage: initialUsage,
  ready,
}: {
  projectId: string;
  projectName: string;
  initial: ChatTurn[];
  usage: { questions: number; costUsd: number };
  ready: boolean;
}) {
  const [turns, setTurns] = useState(initial);
  const [usage, setUsage] = useState(initialUsage);
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns, asked]);

  const send = () => {
    const question = text.trim();
    if (!question || pending) return;
    setError(null);
    setAsked(question);
    setText("");
    start(async () => {
      const res = await askProjectAction(projectId, question);
      if (res.ok) {
        setTurns((t) => [...t, ...res.turns]);
        setUsage(res.usage);
      }
      else {
        setError(res.message);
        setText(question);
      }
      setAsked(null);
    });
  };

  return (
    <section id="ask" className="flex scroll-mt-24 flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="section-title flex items-center gap-2">
          Вопрос агенту
          <InfoHint>
            Агент отвечает только по проекту «{projectName}»: из брифа клиента, плана и цифр месяца, кампаний за последние 30 дней и лога. У
            каждого проекта своя память — прошлые вопросы и ответы учитываются и видны всем, у кого есть доступ к проекту. Агент ничего не
            меняет в рекламе, только отвечает. Каждый ответ оплачивается по API, обычно несколько центов.
          </InfoHint>
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          в этом месяце: вопросов {usage.questions} · {usd.format(usage.costUsd)}
        </span>
      </div>

      {(turns.length > 0 || asked) && (
        <div ref={list} className="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto pr-1">
          {turns.map((t) => (
            <Bubble key={t.id} role={t.role} meta={t.role === "user" ? `${t.author ?? "вопрос"} · ${when(t.at)}` : "агент"}>
              {t.content}
            </Bubble>
          ))}
          {asked && (
            <>
              <Bubble role="user" meta="вы">
                {asked}
              </Bubble>
              <Bubble role="assistant" meta="агент">
                <span className="text-muted-foreground">Смотрю бриф и цифры проекта…</span>
              </Bubble>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          className="field min-h-[72px] flex-1 text-sm"
          placeholder="Например: на какое гео рекламируемся? Какой бюджет на месяц? Что клиент считает заявкой?"
          value={text}
          disabled={!ready || pending}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          aria-label="Вопрос агенту по проекту"
        />
        <button type="button" className="btn-primary" disabled={!ready || pending || !text.trim()} onClick={send} title="⌘/Ctrl + Enter">
          {pending ? "Отвечаю…" : "Спросить"}
        </button>
      </div>
      {!ready && <p className="text-xs text-muted-foreground">ИИ не подключён: нет ключа ANTHROPIC_API_KEY.</p>}
      {error && <p className="text-sm text-negative">{error}</p>}
    </section>
  );
}

function Bubble({ role, meta, children }: { role: "user" | "assistant"; meta: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex max-w-[92%] flex-col gap-1", role === "user" ? "self-end items-end" : "self-start")}>
      <span className="text-[11px] text-muted-foreground">{meta}</span>
      <div
        className={cn(
          "whitespace-pre-line rounded-[16px] px-4 py-2.5 text-sm leading-6 [overflow-wrap:anywhere]",
          role === "user" ? "bg-muted" : "border border-border bg-background/70",
        )}
      >
        {children}
      </div>
    </div>
  );
}
