"use client";

import { Fragment, useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/cn";
import {
  deleteProjectAction,
  listConversionActionsAction,
  listMetaActionsAction,
  syncMetaAction,
  saveProjectAction,
  type ProjectActionState,
} from "@/app/(dashboard)/inputs/actions";
import { METRICS, PLATFORM_LABELS } from "@/lib/domain/metrics";
import type { OwnerCandidates, OwnerOption } from "@/lib/projects/owners";
import type { IntegrationView } from "@/lib/integrations/types";
import { ProjectIntegrations } from "./project-integrations";
import { SocialConnections } from "@/components/social/social-connections";
import { ManychatConnect } from "./manychat-connect";
import type { SocialAccountView } from "@/lib/social/store";
import { ProjectAccess, type AccessView } from "./project-access";
import { META_LEAD_OPTIONS, META_SUBSCRIBER_OPTIONS, metaActionLabel } from "@/lib/meta/results";
import { BriefConductor } from "./brief-conductor";
import { STATUS_META } from "@/lib/domain/statuses";
import {
  GOAL_LEVELS,
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

/** Social accounts of every project, for the «Соцсети проекта» block of the editor. */
export interface SocialInputs {
  origin: string;
  ready: { meta: boolean; threads: boolean; business: boolean };
  byProject: Record<string, { accounts: SocialAccountView[]; token: string; seenAt: string | null }>;
}

export interface MetaAccountOption {
  id: string;
  name: string;
  currency: string;
  active: boolean;
}

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
  planPlus: string;
  cpaPlus: string;
  planSuper: string;
  cpaSuper: string;
}

const CURRENCIES = [
  { code: "EUR", label: "Евро, €" },
  { code: "USD", label: "Доллар, $" },
  { code: "PLN", label: "Злотый, zł" },
  { code: "UAH", label: "Гривна, ₴" },
];

const LEVEL_HINT: Record<string, string> = { base: "Минимум по KPI, 100%", plus: "Перевыполнение плана", super: "Супер-перевыполнение" };
const EMPTY_LEVELS = { planPlus: "", cpaPlus: "", planSuper: "", cpaSuper: "" };

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

const parseNum = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Price per result when only the budget and the amount are known: budget / amount. */
const autoPrice = (budget: string, amount: string) => {
  const b = parseNum(budget), a = parseNum(amount);
  return b && a ? String(Math.round((b / a) * 100) / 100) : "";
};

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const toDraft = (kpis: Kpi[]): KpiDraft[] =>
  kpis.length
    ? kpis.map((k) => ({
        metric: k.metric,
        plan: str(k.plan),
        cpaPlan: str(k.cpaPlan),
        planPlus: str(k.planPlus),
        cpaPlus: str(k.cpaPlus),
        planSuper: str(k.planSuper),
        cpaSuper: str(k.cpaSuper),
      }))
    : [{ metric: "leads", plan: "", cpaPlan: "", ...EMPTY_LEVELS }];

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
  access,
  social,
  serviceAccountEmail,
  adsAccounts,
  metaAccounts,
  canDelete,
  onClose,
}: {
  project: EditableProject | null;
  owners: OwnerCandidates;
  integrations: IntegrationView[];
  access: AccessView[];
  social: SocialInputs | null;
  serviceAccountEmail: string | null;
  adsAccounts: AdsAccountOption[] | null;
  metaAccounts: MetaAccountOption[] | null;
  canDelete: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "onboarding");
  const [goal, setGoal] = useState(project?.goal ?? "");
  const plans = project?.plans ?? [];
  const [startDate, setStartDate] = useState(project?.startDate ?? `${localMonth()}-01`);
  const [planMonth, setPlanMonth] = useState(localMonth);
  const [notes, setNotes] = useState(project?.notes ?? "");
  const initialPlan = planIn(plans, localMonth()).plan;
  const [kpis, setKpis] = useState<KpiDraft[]>(toDraft(initialPlan?.kpis ?? project?.kpis ?? []));
  const [sources, setSources] = useState<SourceDraft[]>(project?.sources ?? []);
  const [services, setServices] = useState(project?.services ?? {});
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
  const [metaActions, setMetaActions] = useState(project?.agent.metaActions ?? { leads: [], subscribers: [] });
  const [telegramChatId, setTelegramChatId] = useState(project?.agent.telegramChatId ?? "");
  const [telegramThreadId, setTelegramThreadId] = useState(project?.agent.telegramThreadId?.toString() ?? "");
  const [agentLeadSource, setAgentLeadSource] = useState<"ads" | "sheet" | "both">(project?.agent.leadSource ?? "ads");
  const [agentDailyReport, setAgentDailyReport] = useState(project?.agent.dailyReport ?? true);
  const [leadsAllFromAds, setLeadsAllFromAds] = useState(project?.agent.leadsAllFromAds ?? true);

  const router = useRouter();
  const [state, formAction, saving] = useActionState(async (prev: ProjectActionState, formData: FormData) => {
    const next = await saveProjectAction(prev, formData);
    // «Сохранить и открыть бриф клиента»: a new project goes straight to its brief page.
    if (next.ok && next.projectId && formData.get("after") === "brief") {
      router.push(`/inputs/brief/${next.projectId}`);
      return next;
    }
    if (next.ok && !next.warning && !next.note) onClose();
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
    // An empty price is filled from the budget: budget / amount of that goal level.
    kpis: kpis.map((k) => {
      const out: Record<string, string> = { ...k };
      for (const lv of GOAL_LEVELS) if (!k[lv.cpa].trim()) out[lv.cpa] = autoPrice(budgetMonth, k[lv.plan]);
      return out;
    }),
    sources,
    services,
    notes,
    smmEmail,
    mediaBuyerEmail,
    leadActions,
    metaActions,
    currency,
    budgetMonth,
    agentDailyReport,
    leadsAllFromAds,
    agentLeadSource,
    telegramChatId,
    telegramThreadId,
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

  /** Open blocks. The rest show one line of what is inside, so the panel reads as a table of contents. */
  const [open, setOpen] = useState<Set<string>>(() => new Set(project ? ["plan"] : ["plan", "sources"]));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const metaSource = sources.find((src) => src.platform === "meta" && src.accountId);
  const socialAccounts = project ? (social?.byProject[project.id]?.accounts ?? []) : [];
  const serviceCount = [services.ga4, services.gtm, services.clarity, services.searchConsole].filter((v) => v?.trim()).length;
  const accessProblems = access.filter((a) => a.status === "failed" || a.error).length;
  const sections = ["plan", "sources", ...(metaSource ? ["meta"] : []), "agent", ...(social ? ["social"] : []), ...(social && project ? ["manychat"] : []), "links", "services", "brief", "notes"];
  const allOpen = sections.every((id) => open.has(id));

  const summary = {
    plan: [
      monthName(planMonth),
      budgetMonth.trim() && `бюджет ${budgetMonth.trim()}${currency ? ` ${currency}` : ""}`,
      kpis[0]?.plan.trim() && `${METRICS[kpis[0].metric].label.toLowerCase()} ${kpis[0].plan.trim()}`,
    ]
      .filter(Boolean)
      .join(" · "),
    sources: sources.length ? sources.map((src) => `${PLATFORM_LABELS[src.platform]}${src.accountId ? "" : " — нет доступа"}`).join(" · ") : "не добавлены",
    meta: [
      `лиды: ${metaActions.leads.length ? metaActions.leads.map(metaActionLabel).join(", ") : "все"}`,
      `подписчики: ${metaActions.subscribers.length ? metaActions.subscribers.map(metaActionLabel).join(", ") : "подписки с рекламы"}`,
    ].join(" · "),
    agent: [
      `заявки: ${agentLeadSource === "ads" ? "кабинет Google Ads" : agentLeadSource === "sheet" ? "таблица клиента" : "кабинет и таблица"}`,
      telegramChatId ? "Telegram подключён" : "Telegram не указан",
      agentDailyReport ? "утренний отчёт включён" : "без утреннего отчёта",
    ].join(" · "),
    social: socialAccounts.length ? socialAccounts.map((a) => `${SOCIAL_LABEL[a.network]} ${a.name}`).join(" · ") : "не подключены",
    links: project
      ? integrations.length
        ? integrations.map((i) => LINK_SHORT[i.kind] ?? i.kind).join(" · ")
        : "ничего не подключено"
      : "папка и таблица «Репорт» при создании",
    services: `${serviceCount ? `ссылок: ${serviceCount} из 4` : "ссылки не указаны"}${project ? ` · доступов: ${access.length}${accessProblems ? `, с ошибкой ${accessProblems}` : ""}` : ""}`,
    notes: notes.trim() ? notes.trim().replace(/\s+/g, " ").slice(0, 80) : "пусто",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={project ? project.name : "Новый проект"}
        className="relative flex h-full w-full max-w-xl flex-col overflow-hidden bg-card shadow-[var(--shadow)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[26px] sm:border sm:border-border"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5 lg:px-6 lg:pt-6">
          <div className="min-w-0">
            <p className="section-kicker">{project ? "Проект" : "Новый проект"}</p>
            <h2 className="section-title truncate">{name.trim() || "Без названия"}</h2>
          </div>
          <button type="button" className="btn-ghost shrink-0 px-3 py-1.5" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="payload" value={payload} />
          {/* Only this part scrolls: the title above and «Сохранить» below stay in place. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5 lg:px-6">

          <div className="flex flex-col gap-3 pb-2">
            <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
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
              <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Например: лиды на консультацию" className="field" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Старт работы">
                <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field" />
              </Field>
              <Field label="SMM">
                <OwnerSelect value={smmEmail} options={owners.smm} onChange={setSmmEmail} empty="Нет роли SMM" />
              </Field>
              <Field label="MediaBuyer">
                <OwnerSelect value={mediaBuyerEmail} options={owners.mediaBuyer} onChange={setMediaBuyerEmail} empty="Нет роли MediaBuyer" />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="section-kicker">Разделы</span>
            <button
              type="button"
              className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
              onClick={() => setOpen(allOpen ? new Set() : new Set(sections))}
            >
              {allOpen ? "Свернуть все" : "Развернуть все"}
            </button>
          </div>

          <Section
            id="plan"
            title="План на месяц"
            summary={summary.plan}
            open={open}
            onToggle={toggle}
            hint="Ставится в начале каждого месяца; пока новый не задан, действует предыдущий. Первый результат — главный: по нему считается темп. Б — минимум по KPI (100%), Б+ — перевыполнение, С — супер-перевыполнение. Цену можно не вписывать: она посчитается как бюджет ÷ количество."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Месяц">
                <input type="month" value={planMonth} onChange={(e) => pickMonth(e.target.value)} className="field tabular-nums" />
              </Field>
              <Field label="Бюджет на месяц">
                <input className="field tabular-nums" inputMode="decimal" placeholder="—" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} />
              </Field>
              <Field label="Валюта кабинета">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="field">
                  {!currency && <option value="">Выберите</option>}
                  {[...CURRENCIES, ...(currency && !CURRENCIES.some((c) => c.code === currency) ? [{ code: currency, label: currency }] : [])].map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {!shown.own && (
              <p className="text-xs text-warning">
                {shown.plan ? `Своего плана на ${monthName(planMonth)} нет — показан план за ${monthName(shown.plan.month)}. Сохраните, чтобы закрепить.` : "Плана ещё нет."}
              </p>
            )}
            {kpis.map((kpi, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Результат"
                    value={kpi.metric}
                    onChange={(e) => setKpis(kpis.map((k, j) => (j === i ? { ...k, metric: e.target.value as ResultMetric } : k)))}
                    className="field"
                  >
                    {RESULT_METRICS.map((m) => (
                      <option key={m} value={m} disabled={m !== kpi.metric && kpis.some((k) => k.metric === m)}>
                        {METRICS[m].label}
                        {i === 0 ? " · главный" : ""}
                      </option>
                    ))}
                  </select>
                  <RemoveButton label="Убрать результат" onClick={() => setKpis(kpis.filter((_, j) => j !== i))} />
                </div>
                <div className="grid grid-cols-[44px_1fr_1fr] items-center gap-x-2 gap-y-1.5">
                  <span />
                  <span className="text-xs text-muted-foreground">Количество</span>
                  <span className="text-xs text-muted-foreground">Цена{currency ? `, ${currency}` : ""}</span>
                  {GOAL_LEVELS.map((lv) => (
                    <Fragment key={lv.key}>
                      <span className="text-sm font-semibold" title={LEVEL_HINT[lv.key]}>
                        {lv.label}
                      </span>
                      <input
                        inputMode="decimal"
                        aria-label={`${lv.label}: количество`}
                        value={kpi[lv.plan]}
                        placeholder="—"
                        onChange={(e) => setKpis(kpis.map((k, j) => (j === i ? { ...k, [lv.plan]: e.target.value } : k)))}
                        className="field tabular-nums"
                      />
                      <input
                        inputMode="decimal"
                        aria-label={`${lv.label}: цена`}
                        value={kpi[lv.cpa]}
                        placeholder={autoPrice(budgetMonth, kpi[lv.plan]) ? `авто ${autoPrice(budgetMonth, kpi[lv.plan])}` : "—"}
                        title="Пусто — посчитается как бюджет / количество"
                        onChange={(e) => setKpis(kpis.map((k, j) => (j === i ? { ...k, [lv.cpa]: e.target.value } : k)))}
                        className="field tabular-nums"
                      />
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
            {unusedMetric && (
              <button type="button" className={ACTION} onClick={() => setKpis([...kpis, { metric: unusedMetric, plan: "", cpaPlan: "", ...EMPTY_LEVELS }])}>
                + Добавить результат
              </button>
            )}
            {plans.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer select-none font-medium text-foreground">Сохранённые планы ({plans.length})</summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...plans].reverse().map((p) => (
                    <button key={p.month} type="button" onClick={() => pickMonth(p.month)} aria-pressed={p.month === planMonth} className={p.month === planMonth ? CHIP_ON : CHIP_OFF}>
                      {monthName(p.month)}
                      {p.kpis[0]?.plan !== null && p.kpis[0] ? ` · ${METRICS[p.kpis[0].metric].label.toLowerCase()} ${p.kpis[0].plan}` : ""}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </Section>

          <Section
            id="sources"
            title="Источники трафика"
            summary={summary.sources}
            tone={sources.some((src) => !src.accountId) ? "warn" : undefined}
            open={open}
            onToggle={toggle}
            hint="Кабинет можно не выбирать, пока нет доступа: источник будет помечен «нет доступа»."
          >
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
                  ) : source.platform === "meta" && metaAccounts && metaAccounts.length > 0 ? (
                    <select
                      value={source.accountId.replace(/\D/g, "")}
                      onChange={(e) => setSources(sources.map((s, j) => (j === i ? { ...s, accountId: e.target.value } : s)))}
                      className="field tabular-nums"
                    >
                      <option value="">Нет доступа / не выбран</option>
                      {source.accountId && !metaAccounts.some((a) => a.id === source.accountId.replace(/\D/g, "")) && (
                        <option value={source.accountId.replace(/\D/g, "")}>{source.accountId} (нет доступа у нашего BM)</option>
                      )}
                      {metaAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || "Без названия"} · {a.id} · {a.currency}
                          {a.active ? "" : " · не активен"}
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
            <button type="button" className={ACTION} onClick={() => setSources([...sources, { platform: "meta", accountId: "" }])}>
              + Добавить источник
            </button>
          </Section>

          {metaSource && (
            <Section
              id="meta"
              title="Meta: что считать результатом"
              summary={summary.meta}
              open={open}
              onToggle={toggle}
              hint={`Цифра у варианта — сколько таких действий было в кабинете ${metaSource.accountId.replace(/\D/g, "")} за последние 30 дней. Несколько выбранных складываются, поэтому не отмечайте «Лиды (все)» вместе с лид-формой или лидами с сайта — они уже внутри.`}
            >
              <MetaResults projectId={project?.id ?? null} accountId={metaSource.accountId.replace(/\D/g, "")} value={metaActions} onChange={setMetaActions} />
            </Section>
          )}

          <Section
            id="agent"
            title="AI-агент"
            summary={summary.agent}
            open={open}
            onToggle={toggle}
            hint="Агент берёт проект отсюда: цель и цену заявки — из плана, бриф — из заметок."
          >
            <AgentSettings
              googleAccountId={sources.find((src) => src.platform === "google" && src.accountId)?.accountId.replace(/\D/g, "") ?? ""}
              adsAccounts={adsAccounts}
              leadActions={leadActions}
              setLeadActions={setLeadActions}
              currency={currency}
              setCurrency={setCurrency}
              telegram={
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <Field label="ID чата">
                    <input className="field tabular-nums" placeholder="-1001234567890" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value.trim())} />
                  </Field>
                  <Field label="Ветка">
                    <input className="field tabular-nums" placeholder="—" value={telegramThreadId} onChange={(e) => setTelegramThreadId(e.target.value.trim())} />
                  </Field>
                </div>
              }
              leadSource={agentLeadSource}
              setLeadSource={setAgentLeadSource}
              leadsAllFromAds={leadsAllFromAds}
              setLeadsAllFromAds={setLeadsAllFromAds}
              hasLeadSheet={integrations.some((i) => i.kind === "sheets_leads" || i.kind === "crm")}
              dailyReport={agentDailyReport}
              setDailyReport={setAgentDailyReport}
            />
          </Section>

          {social && (
            <Section
              id="social"
              title="Соцсети проекта"
              summary={summary.social}
              tone={socialAccounts.some((a) => a.status === "error") ? "bad" : undefined}
              open={open}
              onToggle={toggle}
              hint="Facebook и Instagram берутся из нашего Business Manager. Для Threads клиент открывает ссылку без регистрации и разрешает доступ; пароли к нам не попадают."
            >
              {project ? (
                <SocialConnections
                  embedded
                  projectId={project.id}
                  origin={social.origin}
                  token={social.byProject[project.id]?.token ?? null}
                  seenAt={social.byProject[project.id]?.seenAt ?? null}
                  accounts={socialAccounts}
                  ready={social.ready}
                  canManage
                />
              ) : (
                <p className="text-sm text-muted-foreground">Сохраните проект — после этого здесь появятся страницы из Business Manager и ссылка для клиента.</p>
              )}
            </Section>
          )}

          {social && project && (
            <Section
              id="manychat"
              title="ManyChat"
              summary="адрес и инструкция для автоматизаций"
              open={open}
              onToggle={toggle}
              hint="В каждую автоматизацию ManyChat добавляются два действия «Make External Request»: сразу после триггера и рядом с передачей лида в CRM. Из них строится вкладка «Сообщения» в SMM."
            >
              <ManychatConnect key={`mc-${project.id}`} projectId={project.id} />
            </Section>
          )}

          <Section
            id="links"
            title={project ? "Таблицы, CRM и Drive" : "Google Drive"}
            summary={summary.links}
            tone={integrations.some((i) => i.status === "error") ? "bad" : undefined}
            open={open}
            onToggle={toggle}
          >
            {project ? (
              <ProjectIntegrations projectId={project.id} integrations={integrations} serviceAccountEmail={serviceAccountEmail} />
            ) : (
              <>
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
                    <InfoHint className="ml-1.5">Копия «Template Project» в PROFITAD → PROJECTS. Если папка с таким именем уже есть — подключим её.</InfoHint>
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
                    <InfoHint className="ml-1.5">Копия шаблона в папке проекта; дашборд будет заполнять её каждый день.</InfoHint>
                  </span>
                </label>
                {!serviceAccountEmail && <p className="text-xs text-warning">Google ещё не настроен — создадим позже из карточки проекта.</p>}
              </>
            )}
          </Section>

          <Section
            id="services"
            title="Аналитика и доступы"
            summary={summary.services}
            tone={accessProblems ? "bad" : undefined}
            open={open}
            onToggle={toggle}
            hint="Ссылки на сервисы клиента. Назначенным MediaBuyer и SMM дашборд выдаст доступ сам, при смене специалиста заберёт у прежнего то, что выдавал."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Google Analytics 4">
                <input className="field" placeholder="Ссылка на ресурс или ID" value={services.ga4 ?? ""} onChange={(e) => setServices({ ...services, ga4: e.target.value })} />
              </Field>
              <Field label="Google Tag Manager">
                <input className="field" placeholder="Ссылка на контейнер" value={services.gtm ?? ""} onChange={(e) => setServices({ ...services, gtm: e.target.value })} />
              </Field>
              <Field label="Clarity">
                <input className="field" placeholder="Ссылка на проект" value={services.clarity ?? ""} onChange={(e) => setServices({ ...services, clarity: e.target.value })} />
              </Field>
              <Field label="Search Console">
                <input className="field" placeholder="https://site.com/ или sc-domain:site.com" value={services.searchConsole ?? ""} onChange={(e) => setServices({ ...services, searchConsole: e.target.value })} />
              </Field>
            </div>
            {project && <ProjectAccess projectId={project.id} items={access} />}
          </Section>

          <Section
            id="brief"
            title="Бриф · Дирижёр"
            summary="вставить бриф и разложить по полям проекта"
            open={open}
            onToggle={toggle}
            hint="Вставьте бриф как есть: переписку с клиентом, заметки со звонка, анкету. Дирижёр разложит его по полям проекта и спросит то, чего не хватает для запуска. В форму ничего не попадёт, пока вы не нажмёте «Применить»."
          >
            <BriefConductor
              projectId={project?.id ?? null}
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
                    return [...prev, merge({ metric: kpi.metric, plan: "", cpaPlan: "", ...EMPTY_LEVELS })];
                  });
                }
              }}
            />
          </Section>

          <Section id="notes" title="Заметки" summary={summary.notes} open={open} onToggle={toggle}>
            <textarea rows={5} aria-label="Заметки" value={notes} onChange={(e) => setNotes(e.target.value)} className="field resize-y" />
          </Section>

          </div>

          <div className="flex flex-col gap-2 border-t border-border px-5 py-3 lg:px-6">
            {state.ok && state.note && <p className="text-sm font-medium text-positive">Проект сохранён. {state.note}</p>}
            {error && (
              <p role="alert" className="text-sm font-medium text-negative">
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary" disabled={saving || deleting}>
                {saving ? "Сохраняю…" : project ? "Сохранить" : "Добавить"}
              </button>
              {project && canDelete && (
                <button type="button" className="btn-ghost ml-auto text-negative hover:text-negative" disabled={saving || deleting} onClick={remove}>
                  {deleting ? "Удаляю…" : "Удалить проект"}
                </button>
              )}
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

const SOCIAL_LABEL: Record<SocialAccountView["network"], string> = { facebook: "Facebook", instagram: "Instagram", threads: "Threads" };
const LINK_SHORT: Record<string, string> = { crm: "CRM", sheets_leads: "таблица лидов", sheets_report: "«Репорт»", drive: "папка Drive" };
/** A secondary action inside a block: readable, but never louder than «Сохранить». */
const ACTION = "btn-ghost self-start border border-border px-3.5 py-2 text-sm text-foreground";
const CHIP_ON = "rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground";
const CHIP_OFF = "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground";

/** One block of the editor: a readable title, one line of what is inside while folded, the content on demand. */
function Section({
  id,
  title,
  summary,
  hint,
  tone,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  hint?: React.ReactNode;
  /** A dot on the title: something inside needs a look. */
  tone?: "warn" | "bad";
  open: Set<string>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = open.has(id);
  return (
    <section className={cn("rounded-[20px] border transition-colors", isOpen ? "border-foreground/15 bg-background/60" : "border-border bg-background/30 hover:border-foreground/15")}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" aria-expanded={isOpen} aria-controls={`editor-${id}`} onClick={() => onToggle(id)} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground", isOpen && "rotate-90")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2 text-[15px] font-semibold leading-6 text-foreground">
              {title}
              {tone && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone === "bad" ? "bg-negative" : "bg-warning")} />}
            </span>
            {!isOpen && summary && <span className="truncate text-xs leading-5 text-muted-foreground">{summary}</span>}
          </span>
        </button>
        {hint && <InfoHint>{hint}</InfoHint>}
      </div>
      <div id={`editor-${id}`} className={cn("flex-col gap-3 px-4 pb-4", isOpen ? "flex" : "hidden")}>
        {children}
      </div>
    </section>
  );
}

/** A titled group inside a block. */
function Group({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        {title}
        {hint && <InfoHint>{hint}</InfoHint>}
      </p>
      {children}
    </div>
  );
}

/** A long list of choices: what is chosen stays in sight, the rest opens by a button. */
function ChipPicker({
  options,
  chosen,
  onToggle,
  label = (v) => v,
  count,
  empty,
}: {
  options: string[];
  chosen: string[];
  onToggle: (value: string) => void;
  label?: (value: string) => string;
  count?: (value: string) => number | undefined;
  /** Shown when nothing is chosen: what happens then. */
  empty: string;
}) {
  const [all, setAll] = useState(false);
  const rest = options.filter((o) => !chosen.includes(o));
  const chip = (t: string) => (
    <button key={t} type="button" onClick={() => onToggle(t)} aria-pressed={chosen.includes(t)} title={t} className={chosen.includes(t) ? CHIP_ON : CHIP_OFF}>
      {label(t)}
      {count && <span className="ml-1 opacity-60 tabular-nums">{Math.round(count(t) ?? 0)}</span>}
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.length > 0 ? chosen.map(chip) : <span className="text-xs text-muted-foreground">{empty}</span>}
        {rest.length > 0 && (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
            className="rounded-full border border-dashed border-foreground/25 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            {all ? "Скрыть список" : `Выбрать из списка (${rest.length})`}
          </button>
        )}
      </div>
      {all && rest.length > 0 && <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border p-2.5">{rest.map(chip)}</div>}
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
  telegram,
  leadSource,
  setLeadSource,
  leadsAllFromAds,
  setLeadsAllFromAds,
  hasLeadSheet,
  dailyReport,
  setDailyReport,
}: {
  googleAccountId: string;
  adsAccounts: AdsAccountOption[] | null;
  leadActions: string[];
  setLeadActions: (v: string[]) => void;
  currency: string;
  setCurrency: (v: string) => void;
  telegram: React.ReactNode;
  leadSource: "ads" | "sheet" | "both";
  setLeadSource: (v: "ads" | "sheet" | "both") => void;
  leadsAllFromAds: boolean;
  setLeadsAllFromAds: (v: boolean) => void;
  hasLeadSheet: boolean;
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
  const toggle = (name: string) => setLeadActions(leadActions.includes(name) ? leadActions.filter((a) => a !== name) : [...leadActions, name]);

  return (
    <>
      <Group title="Что считать заявкой в Google Ads">
        {!googleAccountId ? (
          <span className="text-xs text-muted-foreground">Выберите кабинет Google Ads в «Источниках трафика» — появится список конверсий.</span>
        ) : (
          <>
            {options.length > 0 ? (
              <ChipPicker options={options} chosen={leadActions} onToggle={toggle} empty="Не выбрано." />
            ) : (
              <span className="text-xs text-muted-foreground">{available === null && !loadError ? "Загружаю конверсии…" : "Конверсий в кабинете нет."}</span>
            )}
            {loadError && <span className="text-xs text-warning">{loadError}</span>}
            <details className="text-xs text-muted-foreground" open={Boolean(loadError) || undefined}>
              <summary className="cursor-pointer select-none hover:text-foreground">Вписать название вручную</summary>
              <div className="mt-2 flex gap-2">
                <input className="field" placeholder="Название конверсии" value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button
                  type="button"
                  className={cn(ACTION, "shrink-0 self-auto")}
                  disabled={!custom.trim()}
                  onClick={() => {
                    if (!leadActions.includes(custom.trim())) setLeadActions([...leadActions, custom.trim()]);
                    setCustom("");
                  }}
                >
                  Добавить
                </button>
              </div>
            </details>
          </>
        )}
      </Group>

      <Group title="Откуда агент берёт заявки">
        {(
          [
            ["ads", "Кабинет Google Ads", "Конверсии, отмеченные выше."],
            ["sheet", "Таблица клиента", "Лиды из таблицы или CRM, без спама."],
            ["both", "Оба источника", "Считает по таблице; видно, сколько заявок Google не досчитал."],
          ] as const
        ).map(([value, title, hint]) => (
          <label key={value} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="radio"
              name="agentLeadSource"
              checked={leadSource === value}
              disabled={value !== "ads" && !hasLeadSheet}
              onChange={() => setLeadSource(value)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className={value !== "ads" && !hasLeadSheet ? "opacity-50" : undefined}>
              {title}
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
        {!hasLeadSheet && <span className="text-xs text-muted-foreground">Таблица станет доступна после подключения таблицы лидов или CRM.</span>}
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={leadsAllFromAds} onChange={(e) => setLeadsAllFromAds(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Все лиды в таблице — с рекламы
            <span className="block text-xs text-muted-foreground">
              {leadsAllFromAds ? "gclid и метки не нужны." : "С рекламы — только лиды с gclid или платной меткой; остальные показаны отдельно."}
            </span>
          </span>
        </label>
      </Group>

      <Group title="Telegram-чат проекта" hint="ID чата и номер ветки показывает команда /whereami в чате проекта. Раз в 3 дня, если в Логе есть новое, сюда придёт «Посмотреть Лог».">
        {telegram}
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={dailyReport} onChange={(e) => setDailyReport(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Утренний отчёт агента
        </label>
      </Group>
    </>
  );
}

/** What counts as a lead / subscriber in Meta: action types of the ad account, picked from its last 30 days. */
function MetaResults({
  projectId,
  accountId,
  value,
  onChange,
}: {
  projectId: string | null;
  accountId: string;
  value: { leads: string[]; subscribers: string[] };
  onChange: (v: { leads: string[]; subscribers: string[] }) => void;
}) {
  const [available, setAvailable] = useState<{ type: string; count: number }[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMetaActionsAction(accountId).then((r) => {
      if (cancelled) return;
      setAvailable(r.ok ? r.actions : []);
      setLoadError(r.ok ? null : (r.message ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const group = (key: "leads" | "subscribers", title: string, empty: string) => {
    const chosen = value[key];
    // The usual kinds first, then whatever else the account did.
    const main = [...new Set([...(key === "leads" ? META_LEAD_OPTIONS : META_SUBSCRIBER_OPTIONS), ...chosen])];
    const other = (available ?? []).map((a) => a.type).filter((t) => !main.includes(t));
    return (
      <Group title={title}>
        <ChipPicker
          options={[...main, ...other]}
          chosen={chosen}
          onToggle={(t) => onChange({ ...value, [key]: chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen, t] })}
          label={metaActionLabel}
          count={(t) => available?.find((a) => a.type === t)?.count}
          empty={empty}
        />
      </Group>
    );
  };

  return (
    <>
      {available === null && <span className="text-xs text-muted-foreground">Загружаю действия кабинета…</span>}
      {loadError && <span className="text-xs text-warning">{loadError}</span>}
      {group("leads", "Лиды", "Не выбрано — берём «Лиды (все)».")}
      {group("subscribers", "Подписчики", "Не выбрано — считаем подписки на Instagram с рекламы.")}
      {projectId && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            className={cn(ACTION, "self-auto")}
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const r = await syncMetaAction(projectId);
                setSyncMessage({ ok: r.ok, text: r.message });
              })
            }
          >
            {syncing ? "Загружаю…" : "Загрузить данные Meta"}
          </button>
          <InfoHint>Загружает статистику кабинета сейчас. Если меняли выбор выше — сначала сохраните проект. Дальше данные обновляются каждую ночь сами.</InfoHint>
          {syncMessage && <span className={cn("basis-full text-xs", syncMessage.ok ? "text-positive" : "text-warning")}>{syncMessage.text}</span>}
        </div>
      )}
    </>
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
