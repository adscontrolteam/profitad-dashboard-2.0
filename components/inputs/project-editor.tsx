"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  deleteProjectAction,
  listConversionActionsAction,
  saveProjectAction,
  type ProjectActionState,
} from "@/app/(dashboard)/inputs/actions";
import { METRICS, PLATFORM_LABELS } from "@/lib/domain/metrics";
import type { OwnerCandidates, OwnerOption } from "@/lib/projects/owners";
import type { IntegrationView } from "@/lib/integrations/types";
import { ProjectIntegrations } from "./project-integrations";
import { BriefConductor } from "./brief-conductor";
import { STATUS_META } from "@/lib/domain/statuses";
import {
  PROJECT_STATUSES,
  RESULT_METRICS,
  TRAFFIC_PLATFORMS,
  type Kpi,
  type MonthPlan,
  type Project,
  type ProjectStatus,
  type ResultMetric,
  type TrafficPlatform,
} from "@/lib/domain/types";

export type EditableProject = Omit<Project, "metrics">;

export interface AdsAccountOption {
  id: string;
  name: string;
  currency: string;
  status: string;
}

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

const MONTHS_GEN = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthName = (m: string) => `${MONTHS_GEN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const toDraft = (kpis: Kpi[]): KpiDraft[] =>
  kpis.length ? kpis.map((k) => ({ metric: k.metric, plan: k.plan?.toString() ?? "", cpaPlan: k.cpaPlan?.toString() ?? "" })) : [{ metric: "leads", plan: "", cpaPlan: "" }];

/** The month's own plan, or the one carried over from the latest earlier month. */
function planIn(plans: MonthPlan[], month: string): { plan: MonthPlan | null; own: boolean } {
  let found: MonthPlan | null = null;
  for (const p of plans) if (p.month <= month && (!found || p.month > found.month)) found = p;
  return { plan: found, own: found?.month === month };
}

export function ProjectEditor({
  project,
  owners,
  integrations,
  serviceAccountEmail,
  adsAccounts,
  canDelete,
  onClose,
}: {
  project: EditableProject | null;
  owners: OwnerCandidates;
  integrations: IntegrationView[];
  serviceAccountEmail: string | null;
  adsAccounts: AdsAccountOption[] | null;
  canDelete: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [goal, setGoal] = useState(project?.goal ?? "");
  const plans = project?.plans ?? [];
  const [startDate, setStartDate] = useState(project?.startDate ?? `${localMonth()}-01`);
  const [planMonth, setPlanMonth] = useState(localMonth);
  const [notes, setNotes] = useState(project?.notes ?? "");
  const initialPlan = planIn(plans, localMonth()).plan;
  const [kpis, setKpis] = useState<KpiDraft[]>(toDraft(initialPlan?.kpis ?? project?.kpis ?? []));
  const [sources, setSources] = useState<SourceDraft[]>(project?.sources ?? []);
  const [createDrive, setCreateDrive] = useState(Boolean(serviceAccountEmail));
  const [createReport, setCreateReport] = useState(Boolean(serviceAccountEmail));
  const [smmEmail, setSmmEmail] = useState(project?.owners.smm ?? "");
  const [mediaBuyerEmail, setMediaBuyerEmail] = useState(project?.owners.mediaBuyer ?? "");
  const [leadActions, setLeadActions] = useState<string[]>(project?.agent.leadActions ?? []);
  const [currency, setCurrency] = useState(project?.agent.currency ?? "");
  const [budgetMonth, setBudgetMonth] = useState((initialPlan ? initialPlan.budgetMonth : project?.agent.budgetMonth)?.toString() ?? "");
  const shown = planIn(plans, planMonth);

  // Another month: its plan (or the one in force then) becomes the starting point to edit.
  const pickMonth = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setPlanMonth(month);
    const { plan } = planIn(plans, month);
    if (plan) {
      setKpis(toDraft(plan.kpis));
      setBudgetMonth(plan.budgetMonth?.toString() ?? "");
    }
  };
  const [agentDailyReport, setAgentDailyReport] = useState(project?.agent.dailyReport ?? true);

  const [state, formAction, saving] = useActionState(async (prev: ProjectActionState, formData: FormData) => {
    const next = await saveProjectAction(prev, formData);
    if (next.ok && !next.warning) onClose();
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
    startDate,
    planMonth,
    kpis,
    sources,
    notes,
    smmEmail,
    mediaBuyerEmail,
    leadActions,
    currency,
    budgetMonth,
    agentDailyReport,
    createDrive: !project && (createDrive || createReport),
    createReport: !project && createReport,
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

  const error = state.message && !state.ok ? state.message : (state.warning ?? deleteError);

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
            <Field label="Старт работы">
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field" />
            </Field>
            <p className="self-end pb-2 text-xs leading-5 text-muted-foreground">Проект заводится один раз, результаты видны за любые даты, план — по месяцам ниже.</p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="section-kicker mb-2">Ответственные</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SMM">
                <OwnerSelect value={smmEmail} options={owners.smm} onChange={setSmmEmail} empty="Нет пользователей с ролью SMM" />
              </Field>
              <Field label="MediaBuyer">
                <OwnerSelect
                  value={mediaBuyerEmail}
                  options={owners.mediaBuyer}
                  onChange={setMediaBuyerEmail}
                  empty="Нет пользователей с ролью MediaBuyer"
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="section-kicker mb-2">План на месяц</legend>
            <div className="-mt-1 mb-1 flex flex-wrap items-center gap-3">
              <input
                type="month"
                aria-label="Месяц плана"
                value={planMonth}
                onChange={(e) => pickMonth(e.target.value)}
                className="field w-auto tabular-nums"
              />
              <span className="text-xs text-muted-foreground">
                {shown.own
                  ? "План этого месяца"
                  : shown.plan
                    ? `Своего плана нет — показан план за ${monthName(shown.plan.month)}. Сохраните, чтобы закрепить на ${monthName(planMonth)}.`
                    : "Плана ещё нет"}
              </span>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">
              Ставится в начале каждого месяца; пока новый не задан, действует предыдущий. Первый результат — главный: по нему считается темп.
            </p>
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
                <Field label={i === 0 ? `Цена${currency ? `, ${currency}` : ""}` : undefined}>
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
            <div className="grid grid-cols-2 gap-4">
              <Field label="Рекламный бюджет на месяц">
                <input className="field tabular-nums" inputMode="decimal" placeholder="—" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} />
              </Field>
            </div>
            {plans.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[...plans].reverse().map((p) => (
                  <button
                    key={p.month}
                    type="button"
                    onClick={() => pickMonth(p.month)}
                    aria-pressed={p.month === planMonth}
                    className={
                      p.month === planMonth
                        ? "rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                        : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                    }
                  >
                    {monthName(p.month)}
                    {p.kpis[0]?.plan !== null && p.kpis[0] ? ` · ${METRICS[p.kpis[0].metric].label.toLowerCase()} ${p.kpis[0].plan}` : ""}
                  </button>
                ))}
              </div>
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
                <Field label={i === 0 ? "Кабинет" : undefined}>
                  {source.platform === "google" && adsAccounts && adsAccounts.length > 0 ? (
                    <select
                      value={source.accountId.replace(/\D/g, "")}
                      onChange={(e) => setSources(sources.map((s, j) => (j === i ? { ...s, accountId: e.target.value } : s)))}
                      className="field tabular-nums"
                    >
                      <option value="">Нет доступа / не выбран</option>
                      {source.accountId && !adsAccounts.some((a) => a.id === source.accountId.replace(/\D/g, "")) && (
                        <option value={source.accountId.replace(/\D/g, "")}>{source.accountId} (нет в MCC)</option>
                      )}
                      {adsAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || "Без названия"} · {a.id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")} · {a.currency}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={source.accountId}
                      placeholder="нет доступа"
                      onChange={(e) => setSources(sources.map((s, j) => (j === i ? { ...s, accountId: e.target.value } : s)))}
                      className="field tabular-nums"
                    />
                  )}
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

          <BriefConductor
            current={{ projectName: name, goal, notes, currency, budgetMonth, leadActions, kpis }}
            onApply={(patch) => {
              if (patch.goal !== undefined) setGoal(patch.goal);
              if (patch.notes !== undefined) setNotes(patch.notes);
              if (patch.currency !== undefined) setCurrency(patch.currency);
              if (patch.budgetMonth !== undefined) setBudgetMonth(patch.budgetMonth);
              const kpi = patch.kpi;
              if (kpi) {
                const merge = (k: KpiDraft): KpiDraft => ({ ...k, plan: kpi.plan ?? k.plan, cpaPlan: kpi.cpaPlan ?? k.cpaPlan });
                setKpis((prev) => {
                  if (prev.some((k) => k.metric === kpi.metric)) return prev.map((k) => (k.metric === kpi.metric ? merge(k) : k));
                  // A single empty default row is a placeholder: replace it instead of adding a second result.
                  if (prev.length === 1 && !prev[0].plan && !prev[0].cpaPlan) return [merge({ ...prev[0], metric: kpi.metric })];
                  return [...prev, merge({ metric: kpi.metric, plan: "", cpaPlan: "" })];
                });
              }
            }}
          />

          <AgentSettings
            googleAccountId={sources.find((src) => src.platform === "google" && src.accountId)?.accountId.replace(/\D/g, "") ?? ""}
            adsAccounts={adsAccounts}
            leadActions={leadActions}
            setLeadActions={setLeadActions}
            currency={currency}
            setCurrency={setCurrency}
            dailyReport={agentDailyReport}
            setDailyReport={setAgentDailyReport}
          />

          {project ? (
            <ProjectIntegrations projectId={project.id} integrations={integrations} serviceAccountEmail={serviceAccountEmail} />
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="section-kicker mb-2">Google Drive</legend>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={createDrive || createReport}
                  disabled={!serviceAccountEmail || createReport}
                  onChange={(e) => setCreateDrive(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  Создать папку проекта
                  <span className="block text-xs text-muted-foreground">Копия «Template Project» в PROFITAD → PROJECTS. Если папка с таким именем уже есть — подключим её.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={createReport}
                  disabled={!serviceAccountEmail}
                  onChange={(e) => setCreateReport(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  Создать таблицу «Репорт»
                  <span className="block text-xs text-muted-foreground">Копия шаблона в папке проекта; дашборд будет заполнять её каждый день.</span>
                </span>
              </label>
              {!serviceAccountEmail && <p className="text-xs text-warning">Google ещё не настроен — создадим позже из карточки проекта.</p>}
            </fieldset>
          )}

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

function AgentSettings({
  googleAccountId,
  adsAccounts,
  leadActions,
  setLeadActions,
  currency,
  setCurrency,
  dailyReport,
  setDailyReport,
}: {
  googleAccountId: string;
  adsAccounts: AdsAccountOption[] | null;
  leadActions: string[];
  setLeadActions: (v: string[]) => void;
  currency: string;
  setCurrency: (v: string) => void;
  dailyReport: boolean;
  setDailyReport: (v: boolean) => void;
}) {
  const [available, setAvailable] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  // Conversion actions of the chosen Google Ads account; currency comes from the account too.
  useEffect(() => {
    let cancelled = false;
    if (!googleAccountId) return;
    const account = adsAccounts?.find((a) => a.id === googleAccountId);
    if (account?.currency && !currency) setCurrency(account.currency);
    listConversionActionsAction(googleAccountId).then((r) => {
      if (cancelled) return;
      setAvailable(r.ok ? r.actions : null);
      setLoadError(r.ok ? null : (r.message ?? null));
    });
    return () => {
      cancelled = true;
    };
    // Re-run only when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAccountId]);

  const options = [...new Set([...(available ?? []), ...leadActions])];
  const toggle = (name: string) =>
    setLeadActions(leadActions.includes(name) ? leadActions.filter((a) => a !== name) : [...leadActions, name]);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="section-kicker mb-2">AI-агент</legend>
      <p className="-mt-1 text-xs leading-5 text-muted-foreground">
        Агент берёт проект отсюда: цель и цену заявки — из KPI, бриф — из заметок. Заводить клиента в Telegram больше не нужно.
      </p>
      <Field label="Что считать заявкой (конверсии Google Ads)">
        {!googleAccountId ? (
          <span className="text-xs text-muted-foreground">Выберите кабинет Google Ads в источниках — появится список конверсий.</span>
        ) : (
          <div className="flex flex-col gap-2">
            {options.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {options.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggle(name)}
                    aria-pressed={leadActions.includes(name)}
                    className={
                      leadActions.includes(name)
                        ? "rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                        : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">{available === null && !loadError ? "Загружаю конверсии…" : "Конверсий в кабинете нет."}</span>
            )}
            {loadError && <span className="text-xs text-warning">{loadError} Можно вписать вручную:</span>}
            <div className="flex gap-2">
              <input className="field" placeholder="Название конверсии вручную" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button
                type="button"
                className="btn-ghost shrink-0 border border-border px-3 py-1.5 text-xs"
                disabled={!custom.trim()}
                onClick={() => {
                  if (!leadActions.includes(custom.trim())) setLeadActions([...leadActions, custom.trim()]);
                  setCustom("");
                }}
              >
                Добавить
              </button>
            </div>
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Валюта кабинета">
          <input className="field uppercase" maxLength={3} placeholder="EUR" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={dailyReport} onChange={(e) => setDailyReport(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Утренний отчёт агента в Telegram
      </label>
    </fieldset>
  );
}

function OwnerSelect({
  value,
  options,
  onChange,
  empty,
}: {
  value: string;
  options: OwnerOption[];
  onChange: (email: string) => void;
  empty: string;
}) {
  // Keep a previously assigned person selectable even if their role has changed since.
  const all = value && !options.some((o) => o.email === value) ? [...options, { email: value, label: value }] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
      <option value="">{all.length ? "Не назначен" : empty}</option>
      {all.map((o) => (
        <option key={o.email} value={o.email}>
          {o.label}
        </option>
      ))}
    </select>
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
