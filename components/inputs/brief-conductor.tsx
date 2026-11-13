"use client";

import { useState, useTransition } from "react";
import { analyzeBriefAction } from "@/app/(dashboard)/inputs/actions";
import type { BriefAnalysis } from "@/lib/ai/conductor";
import { METRICS } from "@/lib/domain/metrics";
import type { ResultMetric } from "@/lib/domain/types";

export interface BriefCurrent {
  projectName: string;
  goal: string;
  notes: string;
  currency: string;
  budgetMonth: string;
  leadActions: string[];
  kpis: { metric: ResultMetric; plan: string; cpaPlan: string }[];
}

export interface BriefPatch {
  goal?: string;
  notes?: string;
  currency?: string;
  budgetMonth?: string;
  kpi?: { metric: ResultMetric; plan?: string; cpaPlan?: string };
}

interface Change {
  key: "goal" | "kpiPlan" | "kpiCpa" | "budgetMonth" | "currency" | "notes";
  label: string;
  from: string;
  to: string;
}

const num = (v: number | null) => (v === null ? "" : String(v));

function diff(a: BriefAnalysis, cur: BriefCurrent): Change[] {
  const f = a.fields;
  const row = cur.kpis.find((k) => k.metric === f.resultMetric);
  const metricLabel = METRICS[f.resultMetric]?.label ?? f.resultMetric;
  const out: Change[] = [
    { key: "goal", label: "Цель", from: cur.goal, to: f.goal.trim() },
    { key: "kpiPlan", label: `План: ${metricLabel} в месяц`, from: row?.plan ?? "", to: num(f.resultPlan) },
    { key: "kpiCpa", label: `Цена: ${metricLabel}`, from: row?.cpaPlan ?? "", to: num(f.cpaPlan) },
    { key: "budgetMonth", label: "Бюджет на месяц", from: cur.budgetMonth, to: num(f.budgetMonth) },
    { key: "currency", label: "Валюта", from: cur.currency, to: (f.currency ?? "").toUpperCase().slice(0, 3) },
    { key: "notes", label: "Заметки (бриф для агента)", from: cur.notes, to: a.briefMarkdown.trim() },
  ];
  // Empty answer = «не сказано»: never offer to wipe a filled field.
  return out.filter((c) => c.to && c.to !== c.from);
}

export function BriefConductor({ current, onApply }: { current: BriefCurrent; onApply: (patch: BriefPatch) => void }) {
  const [brief, setBrief] = useState("");
  const [analysis, setAnalysis] = useState<BriefAnalysis | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<{ question: string; answer: string }[]>([]);
  const [picked, setPicked] = useState<Set<Change["key"]>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [pending, start] = useTransition();

  const changes = analysis ? diff(analysis, current) : [];

  const run = () => {
    const fresh = (analysis?.questions ?? [])
      .map((q) => ({ question: q.question, answer: (answers[q.question] ?? "").trim() }))
      .filter((a) => a.answer);
    const allAnswers = [...history.filter((h) => !fresh.some((f) => f.question === h.question)), ...fresh];
    setError(null);
    setApplied(false);
    start(async () => {
      const r = await analyzeBriefAction({
        projectName: current.projectName,
        brief,
        answers: allAnswers,
        current: {
          goal: current.goal,
          currency: current.currency || null,
          budgetMonth: current.budgetMonth ? Number(current.budgetMonth.replace(",", ".")) || null : null,
          leadActions: current.leadActions,
        },
      });
      if (!r.ok || !r.analysis) {
        setError(r.message ?? "Не получилось разобрать бриф.");
        return;
      }
      setHistory(allAnswers);
      setAnswers({});
      setAnalysis(r.analysis);
      setPicked(new Set(diff(r.analysis, current).map((c) => c.key)));
    });
  };

  const apply = () => {
    if (!analysis) return;
    const f = analysis.fields;
    const patch: BriefPatch = {};
    if (picked.has("goal")) patch.goal = f.goal.trim();
    if (picked.has("budgetMonth")) patch.budgetMonth = num(f.budgetMonth);
    if (picked.has("currency")) patch.currency = (f.currency ?? "").toUpperCase().slice(0, 3);
    if (picked.has("notes")) patch.notes = analysis.briefMarkdown.trim();
    if (picked.has("kpiPlan") || picked.has("kpiCpa")) {
      patch.kpi = {
        metric: f.resultMetric,
        ...(picked.has("kpiPlan") ? { plan: num(f.resultPlan) } : {}),
        ...(picked.has("kpiCpa") ? { cpaPlan: num(f.cpaPlan) } : {}),
      };
    }
    onApply(patch);
    setApplied(true);
  };

  const toggle = (key: Change["key"]) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const p = analysis?.passport;

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <legend className="section-kicker px-1">Бриф целиком · Дирижёр</legend>
      <p className="-mt-1 text-xs leading-5 text-muted-foreground">
        Вставьте бриф как есть: переписку с клиентом, заметки со звонка, анкету. Дирижёр разложит его по полям проекта и спросит то, чего не хватает для
        запуска. В форму ничего не попадёт, пока вы не нажмёте «Применить».
      </p>
      <textarea
        rows={7}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Клиент — сеть стоматологий в Варшаве, хотят записи на имплантацию…"
        className="field resize-y"
      />
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={pending || brief.trim().length < 20} onClick={run}>
          {pending ? "Дирижёр разбирает…" : analysis ? "Разобрать заново с ответами" : "Разобрать"}
        </button>
        {pending && <span className="text-xs text-muted-foreground">Обычно 20–60 секунд.</span>}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-negative">
          {error}
        </p>
      )}

      {analysis && p && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={
                analysis.readyToLaunch
                  ? "rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground"
                  : "rounded-full bg-muted px-2.5 py-0.5 text-xs text-warning"
              }
            >
              {analysis.readyToLaunch ? "Паспорт готов к запуску" : `Не хватает: ${analysis.questions.length}`}
            </span>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <PassportItem label="Бизнес" value={p.business} />
            <PassportItem label="Оффер" value={p.offer} />
            <PassportItem label="Аудитория" value={p.audience} />
            <PassportItem label="Гео" value={p.geo.join(", ")} />
            <PassportItem label="Что считаем заявкой" value={p.leadDefinition} />
            <PassportItem label="Экономика" value={p.economics} />
            <PassportItem label="Посадочная" value={p.landingUrl} />
            <PassportItem label="Каналы" value={p.channels.join(", ")} />
          </dl>

          {analysis.questions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-medium text-muted-foreground">Дирижёр спрашивает</h4>
              {analysis.questions.map((q) => (
                <label key={q.question} className="flex flex-col gap-1.5">
                  <span className="text-sm">
                    <span className="mr-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{q.topic}</span>
                    {q.question}
                  </span>
                  <span className="text-xs text-muted-foreground">{q.why}</span>
                  <input
                    className="field"
                    placeholder="Ответ — или оставьте пустым"
                    value={answers[q.question] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.question]: e.target.value })}
                  />
                </label>
              ))}
              <button type="button" className="btn-ghost self-start border border-border px-3 py-1.5 text-xs" disabled={pending} onClick={run}>
                Отправить ответы и разобрать заново
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">Что поменяется в проекте</h4>
            {changes.length === 0 ? (
              <span className="text-xs text-muted-foreground">{applied ? "Применено. Не забудьте сохранить проект." : "Новых значений для полей нет."}</span>
            ) : (
              <>
                {changes.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-start gap-3 text-sm">
                    <input type="checkbox" checked={picked.has(c.key)} onChange={() => toggle(c.key)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                    <span className="min-w-0">
                      {c.label}
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.key === "notes" ? (c.from ? "заменит текущие заметки" : "заполнит пустые заметки") : `${c.from || "—"} → ${c.to}`}
                      </span>
                    </span>
                  </label>
                ))}
                {picked.has("notes") && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs leading-5">{analysis.briefMarkdown}</pre>
                )}
                <button type="button" className="btn-primary self-start" disabled={picked.size === 0} onClick={apply}>
                  Применить к проекту
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}

function PassportItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={value ? "break-words" : "text-warning"}>{value || "не указано"}</dd>
    </div>
  );
}
