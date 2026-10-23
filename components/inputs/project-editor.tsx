"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  deleteProjectAction,
  saveProjectAction,
  type ProjectActionState,
} from "@/app/(dashboard)/inputs/actions";
import { METRICS, PLATFORM_LABELS } from "@/lib/domain/metrics";
import { STATUS_META } from "@/lib/domain/statuses";
import {
  PROJECT_STATUSES,
  RESULT_METRICS,
  TRAFFIC_PLATFORMS,
  type Project,
  type ProjectStatus,
  type ResultMetric,
  type TrafficPlatform,
} from "@/lib/domain/types";

export type EditableProject = Omit<Project, "metrics">;

interface KpiDraft {
  metric: ResultMetric;
  plan: string;
  cpaPlan: string;
}

interface SourceDraft {
  platform: TrafficPlatform;
  accountId: string;
}

const IDLE: ProjectActionState = { ok: false, message: null };

function currentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}` };
}

export function ProjectEditor({
  project,
  canDelete,
  onClose,
}: {
  project: EditableProject | null;
  canDelete: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [goal, setGoal] = useState(project?.goal ?? "");
  const [period, setPeriod] = useState(project?.period ?? currentMonth);
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [kpis, setKpis] = useState<KpiDraft[]>(
    project?.kpis.map((k) => ({ metric: k.metric, plan: k.plan?.toString() ?? "", cpaPlan: k.cpaPlan?.toString() ?? "" })) ?? [
      { metric: "leads", plan: "", cpaPlan: "" },
    ],
  );
  const [sources, setSources] = useState<SourceDraft[]>(project?.sources ?? []);

  const [state, formAction, saving] = useActionState(async (prev: ProjectActionState, formData: FormData) => {
    const next = await saveProjectAction(prev, formData);
    if (next.ok) onClose();
    return next;
  }, IDLE);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const payload = JSON.stringify({
    id: project?.id,
    name,
    status,
    goal,
    periodStart: period.start,
    periodEnd: period.end,
    kpis,
    sources,
    notes,
  });

  const unusedMetric = RESULT_METRICS.find((m) => !kpis.some((k) => k.metric === m));

  const remove = () => {
    if (!project || !window.confirm(`Удалить проект «${project.name}»? Его данные из кабинетов тоже удалятся из дашборда.`)) return;
    startDelete(async () => {
      const result = await deleteProjectAction(project.id);
      if (result.ok) onClose();
      else setDeleteError(result.message);
    });
  };

  const error = state.message && !state.ok ? state.message : deleteError;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={project ? project.name : "Новый проект"}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-card p-5 shadow-[var(--shadow)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[26px] sm:border sm:border-border lg:p-6"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="section-title">{project ? "Проект" : "Новый проект"}</h2>
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form action={formAction} className="flex flex-1 flex-col gap-5">
          <input type="hidden" name="payload" value={payload} />

          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Название">
              <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className="field" />
            </Field>
            <Field label="Статус">
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className="field">
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Основная цель">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Например: лиды на консультацию"
              className="field"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Начало периода">
              <input type="date" required value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} className="field" />
            </Field>
            <Field label="Конец периода">
              <input type="date" required value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} className="field" />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="section-kicker mb-2">Результаты и KPI</legend>
            <p className="-mt-1 mb-1 text-xs text-muted-foreground">Первый результат — главный: по нему считается темп проекта.</p>
            {kpis.map((kpi, i) => (
              <div key={i} className="grid grid-cols-[1fr_96px_110px_auto] items-end gap-2">
                <Field label={i === 0 ? "Результат" : undefined}>
                  <select
                    value={kpi.metric}
                    onChange={(e) => setKpis(kpis.map((k, j) => (j === i ? { ...k, metric: e.target.value as ResultMetric } : k)))}
                    className="field"
                  >
                    {RESULT_METRICS.map((m) => (
                      <option key={m} value={m} disabled={m !== kpi.metric && kpis.some((k) => k.metric === m)}>
                        {METRICS[m].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={i === 0 ? "План" : undefined}>
                  <input
                    inputMode="decimal"
                    value={kpi.plan}
                    placeholder="—"
                    onChange={(e) => setKpis(kpis.map((k, j) => (j === i ? { ...k, plan: e.target.value } : k)))}
                    className="field tabular-nums"
                  />
                </Field>
                <Field label={i === 0 ? "Цена, $" : undefined}>
                  <input
                    inputMode="decimal"
                    value={kpi.cpaPlan}
                    placeholder="—"
                    onChange={(e) => setKpis(kpis.map((k, j) => (j === i ? { ...k, cpaPlan: e.target.value } : k)))}
                    className="field tabular-nums"
                  />
                </Field>
                <RemoveButton label="Убрать результат" onClick={() => setKpis(kpis.filter((_, j) => j !== i))} />
              </div>
            ))}
            {unusedMetric && (
              <button
                type="button"
                className="btn-ghost self-start px-3 py-1.5 text-xs"
                onClick={() => setKpis([...kpis, { metric: unusedMetric, plan: "", cpaPlan: "" }])}
              >
                + Добавить результат
              </button>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="section-kicker mb-2">Источники трафика</legend>
            <p className="-mt-1 mb-1 text-xs text-muted-foreground">
              ID кабинета можно оставить пустым, пока нет доступа: источник будет помечен «нет доступа».
            </p>
            {sources.map((source, i) => (
              <div key={i} className="grid grid-cols-[150px_1fr_auto] items-end gap-2">
                <Field label={i === 0 ? "Площадка" : undefined}>
                  <select
                    value={source.platform}
                    onChange={(e) => setSources(sources.map((s, j) => (j === i ? { ...s, platform: e.target.value as TrafficPlatform } : s)))}
                    className="field"
                  >
                    {TRAFFIC_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={i === 0 ? "ID кабинета" : undefined}>
                  <input
                    value={source.accountId}
                    placeholder="нет доступа"
                    onChange={(e) => setSources(sources.map((s, j) => (j === i ? { ...s, accountId: e.target.value } : s)))}
                    className="field tabular-nums"
                  />
                </Field>
                <RemoveButton label="Убрать источник" onClick={() => setSources(sources.filter((_, j) => j !== i))} />
              </div>
            ))}
            <button
              type="button"
              className="btn-ghost self-start px-3 py-1.5 text-xs"
              onClick={() => setSources([...sources, { platform: "meta", accountId: "" }])}
            >
              + Добавить источник
            </button>
          </fieldset>

          <Field label="Заметки">
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="field resize-y" />
          </Field>

          {error && (
            <p role="alert" className="text-sm font-medium text-negative">
              {error}
            </p>
          )}

          <div className="mt-auto flex items-center gap-2 pt-2">
            <button type="submit" className="btn-primary" disabled={saving || deleting}>
              {saving ? "Сохраняю…" : project ? "Сохранить" : "Добавить"}
            </button>
            {project && canDelete && (
              <button
                type="button"
                className="btn-ghost ml-auto text-negative hover:text-negative"
                disabled={saving || deleting}
                onClick={remove}
              >
                {deleting ? "Удаляю…" : "Удалить проект"}
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      {children}
    </label>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-[38px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-negative"
    >
      ×
    </button>
  );
}
