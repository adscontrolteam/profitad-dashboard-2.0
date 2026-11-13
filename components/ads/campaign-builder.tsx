"use client";

import { useMemo, useState, useTransition } from "react";
import { launchGoogleSearchAction } from "@/app/(dashboard)/ads/actions";
import { Field, Segmented, StepCard, Toast, ToggleChip } from "@/components/workspace/form";
import { uid, useLocalState } from "@/components/workspace/use-local-state";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { seedCreatives, type CampaignDraft, type Creative } from "./types";

const OBJECTIVES = {
  meta: [
    { value: "CONV", label: "Лиды / конверсии" },
    { value: "SALES", label: "Продажи" },
    { value: "MSG", label: "Сообщения" },
    { value: "TRAFFIC", label: "Трафик" },
    { value: "ENG", label: "Вовлечённость" },
  ],
  google: [
    { value: "SEARCH", label: "Поиск" },
    { value: "PMAX", label: "Performance Max" },
    { value: "DEMAND", label: "Demand Gen / YouTube" },
  ],
} as const;

const META_PLACEMENTS = ["Facebook Feed", "Instagram Feed", "Instagram Reels", "Stories", "Threads", "Audience Network"];
const GEO_OPTIONS = ["UA", "PL", "DE", "ES", "IT", "US", "GB", "KZ"];

const today = () => new Date().toISOString().slice(0, 10);

function blank(): CampaignDraft {
  return {
    id: "",
    name: "",
    platform: "meta",
    objective: "CONV",
    budgetType: "daily",
    budget: 30,
    startDate: today(),
    endDate: "",
    geo: ["PL"],
    ageMin: 25,
    ageMax: 45,
    gender: "all",
    audience: "",
    placements: "auto",
    placementList: META_PLACEMENTS.slice(0, 4),
    creativeIds: [],
    url: "",
    status: "draft",
    createdAt: "",
  };
}

const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export function CampaignBuilder({
  projectId,
  projectName,
  googleAccountId,
  googleReady,
}: {
  projectId: string;
  projectName: string;
  /** Google Ads account of the project (from Inputs); null = none linked. */
  googleAccountId: string | null;
  /** The dashboard has Google Ads API credentials. */
  googleReady: boolean;
}) {
  const [headlinesText, setHeadlinesText] = useState("");
  const [descriptionsText, setDescriptionsText] = useState("");
  const [launching, startLaunch] = useTransition();
  const [drafts, setDrafts] = useLocalState<CampaignDraft[]>(`campaigns:${projectId}`, []);
  const [creatives] = useLocalState<Creative[]>(`creatives:${projectId}`, seedCreatives(projectName));
  const [form, setForm] = useState<CampaignDraft>(() => blank());
  const [toast, setToast] = useState<string | null>(null);

  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key: "geo" | "placementList" | "creativeIds", value: string) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const prefix = projectName.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  const autoName = `${prefix}_${form.geo.join("-") || "GEO"}_${form.objective}`;
  const name = form.name || autoName;

  const days = useMemo(() => {
    if (!form.endDate) return 30;
    const d = (new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86_400_000 + 1;
    return Math.max(1, Math.round(d));
  }, [form.startDate, form.endDate]);
  const total = form.budgetType === "daily" ? form.budget * days : form.budget;

  const isGoogle = form.platform === "google";
  const googleSearch = isGoogle && form.objective === "SEARCH";
  const headlines = lines(headlinesText);
  const descriptions = lines(descriptionsText);
  const canLaunchGoogle = googleSearch && googleReady && Boolean(googleAccountId);

  const errors = [
    !form.budget || form.budget <= 0 ? "Укажите бюджет" : null,
    form.geo.length === 0 ? "Выберите гео" : null,
    !isGoogle && form.creativeIds.length === 0 ? "Добавьте хотя бы один креатив" : null,
    googleSearch && lines(form.audience).length === 0 ? "Добавьте ключевые слова" : null,
    googleSearch && headlines.length < 3 ? "Нужно минимум 3 заголовка" : null,
    googleSearch && headlines.some((h) => h.length > 30) ? "Заголовки — до 30 символов" : null,
    googleSearch && descriptions.length < 2 ? "Нужно минимум 2 описания" : null,
    googleSearch && descriptions.some((d) => d.length > 90) ? "Описания — до 90 символов" : null,
    !/^https?:\/\/\S+\.\S+/.test(form.url) ? "Укажите ссылку (https://…)" : null,
  ].filter(Boolean) as string[];

  const remember = (status: CampaignDraft["status"], externalId: string | null = null) => {
    const draft: CampaignDraft = {
      ...form,
      id: form.id || uid(),
      name,
      headlines,
      descriptions,
      status,
      externalId,
      createdAt: form.createdAt || new Date().toISOString(),
    };
    setDrafts((list) => [draft, ...list.filter((d) => d.id !== draft.id)]);
  };

  /** Google Search: validate in Google (dry run) or create for real. */
  const launchGoogle = (validateOnly: boolean) => {
    if (errors.length) {
      setToast(errors.join(" · "));
      return;
    }
    if (!validateOnly && !window.confirm(`Создать и запустить «${name}» в Google Ads с бюджетом ${form.budget} в день?`)) return;
    startLaunch(async () => {
      const r = await launchGoogleSearchAction(
        projectId,
        googleAccountId!,
        {
          name,
          dailyBudget: form.budget,
          geo: form.geo,
          keywords: lines(form.audience),
          headlines,
          descriptions,
          finalUrl: form.url,
          enable: true,
        },
        validateOnly,
      );
      setToast(r.message);
      if (r.ok && !validateOnly) {
        remember("launched", r.campaignId ?? null);
        setForm(blank());
        setHeadlinesText("");
        setDescriptionsText("");
      }
    });
  };

  const save = (status: CampaignDraft["status"]) => {
    if (status === "queued" && errors.length) {
      setToast(errors.join(" · "));
      return;
    }
    remember(status);
    setForm(blank());
    setToast(
      status === "draft"
        ? `Черновик «${name}» сохранён.`
        : !isGoogle
          ? `«${name}» сохранена к запуску. Доступ приложения Meta к API сейчас заблокирован — кампания уйдёт в кабинет после разблокировки.`
          : !googleAccountId
            ? `«${name}» сохранена. Привяжите кабинет Google Ads к проекту во «Вводных», чтобы запускать отсюда.`
            : !googleReady
              ? `«${name}» сохранена. Google Ads API ещё не настроен в «Настройки → Подключения».`
              : `«${name}» сохранена. Из дашборда пока запускаются только поисковые кампании (Поиск).`,
    );
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <StepCard n={1} title="Платформа и цель">
          <div className="flex flex-col gap-4">
            <Segmented
              value={form.platform}
              onChange={(platform) => setForm((f) => ({ ...f, platform, objective: OBJECTIVES[platform][0].value }))}
              options={[
                { value: "meta", label: "Meta Ads" },
                { value: "google", label: "Google Ads" },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {OBJECTIVES[form.platform].map((o) => (
                <ToggleChip key={o.value} on={form.objective === o.value} onClick={() => set("objective", o.value)}>
                  {o.label}
                </ToggleChip>
              ))}
            </div>
            <Field label="Название кампании" hint="— по умолчанию собирается автоматически">
              <input className="field" value={form.name} placeholder={autoName} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </div>
        </StepCard>

        <StepCard n={2} title="Бюджет и сроки">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Тип бюджета">
              <Segmented
                value={isGoogle ? "daily" : form.budgetType}
                onChange={(v) => set("budgetType", v)}
                options={
                  isGoogle
                    ? [{ value: "daily" as const, label: "Дневной" }]
                    : [
                        { value: "daily" as const, label: "Дневной" },
                        { value: "lifetime" as const, label: "На весь период" },
                      ]
                }
              />
            </Field>
            <Field label="Сумма, $">
              <input
                className="field"
                type="number"
                min={1}
                inputMode="decimal"
                value={form.budget || ""}
                onChange={(e) => set("budget", Number(e.target.value))}
              />
            </Field>
            <Field label="Старт">
              <input className="field" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label="Окончание" hint="— необязательно">
              <input className="field" type="date" value={form.endDate} min={form.startDate} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
          </div>
        </StepCard>

        <StepCard n={3} title="Аудитория">
          <div className="flex flex-col gap-4">
            <Field label="Гео">
              <div className="flex flex-wrap gap-2">
                {GEO_OPTIONS.map((g) => (
                  <ToggleChip key={g} on={form.geo.includes(g)} onClick={() => toggleIn("geo", g)}>
                    {g}
                  </ToggleChip>
                ))}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Возраст от">
                <input className="field" type="number" min={13} max={65} value={form.ageMin} onChange={(e) => set("ageMin", Number(e.target.value))} />
              </Field>
              <Field label="Возраст до">
                <input className="field" type="number" min={13} max={65} value={form.ageMax} onChange={(e) => set("ageMax", Number(e.target.value))} />
              </Field>
              <Field label="Пол">
                <select className="field" value={form.gender} onChange={(e) => set("gender", e.target.value as CampaignDraft["gender"])}>
                  <option value="all">Все</option>
                  <option value="female">Женщины</option>
                  <option value="male">Мужчины</option>
                </select>
              </Field>
            </div>
            <Field label={form.platform === "google" ? "Ключевые слова" : "Интересы / Advantage+"} hint={isGoogle ? "— через запятую или с новой строки, фразовое соответствие" : "— через запятую"}>
              <textarea
                className="field min-h-20"
                value={form.audience}
                placeholder={form.platform === "google" ? "купить квартиру варшава, новостройки польша" : "Пусто = Advantage+ аудитория"}
                onChange={(e) => set("audience", e.target.value)}
              />
            </Field>
          </div>
        </StepCard>

        {form.platform === "meta" && (
          <StepCard n={4} title="Плейсменты">
            <div className="flex flex-col gap-3">
              <Segmented
                value={form.placements}
                onChange={(v) => set("placements", v)}
                options={[
                  { value: "auto", label: "Advantage+ (авто)" },
                  { value: "manual", label: "Вручную" },
                ]}
              />
              {form.placements === "manual" && (
                <div className="flex flex-wrap gap-2">
                  {META_PLACEMENTS.map((p) => (
                    <ToggleChip key={p} on={form.placementList.includes(p)} onClick={() => toggleIn("placementList", p)}>
                      {p}
                    </ToggleChip>
                  ))}
                </div>
              )}
            </div>
          </StepCard>
        )}

        {googleSearch && (
          <StepCard n={4} title="Объявление (адаптивное поисковое)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Заголовки" hint={`— по одному в строке, 3–15, до 30 симв. · ${headlines.length}`}>
                <textarea
                  className="field min-h-36"
                  value={headlinesText}
                  onChange={(e) => setHeadlinesText(e.target.value)}
                  placeholder={"Юрист по ВНЖ в Польше\nКонсультация за 24 часа\nФиксированная цена"}
                />
              </Field>
              <Field label="Описания" hint={`— по одному в строке, 2–4, до 90 симв. · ${descriptions.length}`}>
                <textarea
                  className="field min-h-36"
                  value={descriptionsText}
                  onChange={(e) => setDescriptionsText(e.target.value)}
                  placeholder={"Подготовим документы и подадим заявление. Оставьте заявку — перезвоним сегодня."}
                />
              </Field>
            </div>
            {[...headlines.filter((h) => h.length > 30), ...descriptions.filter((d) => d.length > 90)].length > 0 && (
              <p className="mt-2 text-xs text-negative">Есть слишком длинные строки — Google их не примет.</p>
            )}
          </StepCard>
        )}

        <StepCard n={form.platform === "meta" ? 5 : googleSearch ? 5 : 4} title={isGoogle ? "Ссылка" : "Креативы и ссылка"}>
          <div className="flex flex-col gap-4">
            {!isGoogle && (
              <>
            {creatives.length === 0 ? (
              <p className="text-sm text-muted-foreground">Креативов пока нет — подготовьте их во вкладке «Креативы».</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {creatives.map((c) => {
                  const on = form.creativeIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleIn("creativeIds", c.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex items-center gap-3 rounded-[18px] border p-2.5 text-left transition-colors",
                        on ? "border-ring bg-muted" : "border-border hover:bg-muted/60",
                      )}
                    >
                      <span
                        className="size-12 shrink-0 rounded-[12px]"
                        style={{ background: `linear-gradient(135deg, hsl(${c.hue} 70% 55%), hsl(${(c.hue + 50) % 360} 70% 35%))` }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.format} · {c.status}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                          on ? "border-transparent bg-accent text-accent-foreground" : "border-border",
                        )}
                      >
                        {on ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
              </>
            )}
            <Field label="Ссылка назначения" hint="— UTM добавятся автоматически">
              <input className="field" type="url" placeholder="https://site.com/landing" value={form.url} onChange={(e) => set("url", e.target.value)} />
            </Field>
          </div>
        </StepCard>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-0">
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)]">
          <p className="section-kicker">Сводка</p>
          <p className="mt-2 text-base font-bold tracking-[-0.02em] [overflow-wrap:anywhere]">{name}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Summary label="Платформа" value={form.platform === "meta" ? "Meta Ads" : "Google Ads"} />
            <Summary label="Цель" value={OBJECTIVES[form.platform].find((o) => o.value === form.objective)?.label ?? "—"} />
            <Summary label="Бюджет" value={`${formatCurrency(form.budget || 0)}${form.budgetType === "daily" ? " / день" : ""}`} />
            <Summary label={`Итого за ${days} дн.`} value={formatCurrency(total || 0)} />
            <Summary label="Гео" value={form.geo.join(", ") || "—"} />
            <Summary label="Креативов" value={String(form.creativeIds.length)} />
          </dl>
          {errors.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
              {errors.map((e) => (
                <li key={e}>· {e}</li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {canLaunchGoogle ? (
              <>
                <button type="button" className="btn-primary" disabled={launching} onClick={() => launchGoogle(false)}>
                  {launching ? "Отправляю…" : "Запустить в Google Ads"}
                </button>
                <button type="button" className="btn-ghost border border-border" disabled={launching} onClick={() => launchGoogle(true)}>
                  Проверить в Google
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={() => save("queued")}>
                Запустить
              </button>
            )}
            <button type="button" className="btn-ghost border border-border" disabled={launching} onClick={() => save("draft")}>
              В черновик
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {canLaunchGoogle
              ? `Кампания создастся в кабинете ${googleAccountId} со стратегией «Максимум конверсий» и сразу начнёт показы.`
              : isGoogle && !googleAccountId
                ? "Кабинет Google Ads не привязан к проекту — добавьте его во «Вводных»."
                : isGoogle && !googleReady
                  ? "Google Ads API не настроен — пока сохраняем как задание."
                  : isGoogle
                    ? "Из дашборда запускаются поисковые кампании; остальные типы — сохраняем как задание."
                    : "Meta API сейчас заблокирован — кампания сохранится и уйдёт в кабинет после разблокировки."}
          </p>
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow)]">
          <p className="section-kicker mb-3">Кампании проекта</p>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока ничего не собрано.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {drafts.map((d) => (
                <li key={d.id} className="flex flex-col gap-1.5 py-3">
                  <p className="text-sm font-semibold [overflow-wrap:anywhere]">{d.name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        d.status === "launched"
                        ? "bg-positive/12 text-positive"
                        : d.status === "queued"
                          ? "bg-warning/14 text-warning"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {d.status === "launched" ? "запущена" : d.status === "queued" ? "к запуску" : "черновик"}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {d.platform === "meta" ? "Meta" : "Google"} · {formatCurrency(d.budget)}
                      {d.budgetType === "daily" ? "/день" : ""}
                    </span>
                    <span className="ml-auto flex gap-1">
                      <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => {
                          setForm(d);
                          setHeadlinesText((d.headlines ?? []).join("\n"));
                          setDescriptionsText((d.descriptions ?? []).join("\n"));
                        }}>
                        Открыть
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-2.5 py-1 text-xs text-negative hover:text-negative"
                        onClick={() => setDrafts((list) => list.filter((x) => x.id !== d.id))}
                        aria-label={`Удалить ${d.name}`}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
