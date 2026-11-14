"use client";

import { useState, useTransition } from "react";
import {
  detectReportAction,
  createFromTemplateAction,
  disconnectAction,
  revealWebhookAction,
  rotateWebhookKeyAction,
  saveCrmAction,
  saveDriveAction,
  saveLeadsSheetAction,
  saveReportAction,
  syncNowAction,
  type IntegrationResult,
} from "@/app/(dashboard)/inputs/integration-actions";
import { cn } from "@/lib/cn";
import { CRM_LABELS, CRM_TYPES, INTEGRATION_LABELS, type CrmType, type IntegrationKind } from "@/lib/integrations/kinds";
import {
  REPORT_METRIC_LABELS,
  REPORT_METRICS,
  type CrmConfig,
  type DriveConfig,
  type IntegrationView,
  type ReportTab,
  type SheetsLeadsConfig,
  type SheetsReportConfig,
  leadTabsOf,
} from "@/lib/integrations/types";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

/** CRM, lead sheet, daily report sheet and Drive folder of one project. Admin only (Inputs). */
export function ProjectIntegrations({
  projectId,
  integrations,
  serviceAccountEmail,
}: {
  projectId: string;
  integrations: IntegrationView[];
  serviceAccountEmail: string | null;
}) {
  const byKind = new Map(integrations.map((i) => [i.kind, i]));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="section-kicker mb-2">Подключения</legend>
      {serviceAccountEmail ? (
        <p className="-mt-1 text-xs leading-5 text-muted-foreground">
          Таблицы и папки в вашем Google Workspace доступны автоматически. Для чужих таблиц откройте доступ «Редактор» для{" "}
          <button
            type="button"
            className="font-semibold text-foreground underline decoration-dotted"
            onClick={() => navigator.clipboard?.writeText(serviceAccountEmail)}
            title="Скопировать"
          >
            {serviceAccountEmail}
          </button>
        </p>
      ) : (
        <p className="-mt-1 text-xs leading-5 text-warning">
          Сервис-аккаунт Google ещё не настроен — Таблицы и Drive заработают после этого (Настройки → Подключения).
        </p>
      )}
      <CrmCard projectId={projectId} current={byKind.get("crm") as IntegrationView<"crm"> | undefined} />
      <LeadsSheetCard projectId={projectId} current={byKind.get("sheets_leads") as IntegrationView<"sheets_leads"> | undefined} />
      <ReportCard projectId={projectId} current={byKind.get("sheets_report") as IntegrationView<"sheets_report"> | undefined} />
      <DriveCard projectId={projectId} current={byKind.get("drive") as IntegrationView<"drive"> | undefined} />
    </fieldset>
  );
}

function useRunner() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<IntegrationResult | null>(null);
  const run = (fn: () => Promise<IntegrationResult>, after?: (r: IntegrationResult) => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      after?.(r);
    });
  return { pending, result, setResult, run };
}

function Shell({
  kind,
  current,
  projectId,
  children,
  summary,
}: {
  kind: IntegrationKind;
  current: IntegrationView | undefined;
  projectId: string;
  children: React.ReactNode;
  summary?: React.ReactNode;
}) {
  const { pending, result, run } = useRunner();
  const [open, setOpen] = useState(!current);
  const status = current?.status;

  return (
    <section className="rounded-[18px] border border-border bg-background/60 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            !current ? "bg-muted-foreground/40" : status === "ok" ? "bg-positive" : status === "error" ? "bg-negative" : "bg-warning",
          )}
        />
        <p className="min-w-0 flex-1 text-sm font-semibold">{INTEGRATION_LABELS[kind]}</p>
        {current && (
          <div className="flex gap-1">
            {kind !== "drive" && (
              <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={pending} onClick={() => run(() => syncNowAction(projectId, kind))}>
                {pending ? "…" : "Синхр."}
              </button>
            )}
            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setOpen((o) => !o)}>
              {open ? "Свернуть" : "Изменить"}
            </button>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs text-negative hover:text-negative"
              disabled={pending}
              onClick={() => window.confirm("Отключить?") && run(() => disconnectAction(projectId, kind))}
            >
              Откл.
            </button>
          </div>
        )}
      </div>
      {current && (
        <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {summary}
          {current.lastSyncAt && ` · обновлено ${when(current.lastSyncAt)}`}
        </p>
      )}
      {current?.lastError && <p className="mt-1 text-xs text-negative">{current.lastError}</p>}
      {result?.message && <p className={cn("mt-1 text-xs", result.ok ? "text-positive" : "text-negative")}>{result.message}</p>}
      {open && <div className="mt-3 flex flex-col gap-2.5">{children}</div>}
    </section>
  );
}

function Result({ r }: { r: IntegrationResult | null }) {
  if (!r?.message) return null;
  return <p className={cn("text-xs", r.ok ? "text-positive" : "text-negative")}>{r.message}</p>;
}

/* ---------- CRM ---------- */

function CrmCard({ projectId, current }: { projectId: string; current?: IntegrationView<"crm"> }) {
  const cfg = current?.config as CrmConfig | undefined;
  const [type, setType] = useState<CrmType>(cfg?.type ?? "webhook");
  const [domain, setDomain] = useState(cfg?.domain ?? "");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const { pending, result, run } = useRunner();

  const save = () => run(() => saveCrmAction(projectId, { type, domain, secret }), (r) => {
    if (r.webhookUrl) setUrl(r.webhookUrl);
    if (r.ok) setSecret("");
  });

  return (
    <Shell kind="crm" current={current} projectId={projectId} summary={cfg && CRM_LABELS[cfg.type]}>
      <select className="field" value={type} onChange={(e) => setType(e.target.value as CrmType)}>
        {CRM_TYPES.map((t) => (
          <option key={t} value={t}>
            {CRM_LABELS[t]}
          </option>
        ))}
      </select>

      {type === "webhook" && (
        <>
          <p className="text-xs leading-5 text-muted-foreground">
            CRM, форма на сайте, Tilda, Zapier или Make отправляют POST с полями name, phone, email, status, utm_*. Лиды появляются сразу.
          </p>
          {url && (
            <div className="flex items-center gap-2 rounded-[12px] bg-muted px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
              <button type="button" className="text-xs font-semibold" onClick={() => navigator.clipboard?.writeText(url)}>
                Копировать
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {current?.config.type === "webhook" ? (
              <>
                <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={() => run(() => revealWebhookAction(projectId), (r) => r.webhookUrl && setUrl(r.webhookUrl))}>
                  Показать адрес
                </button>
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-xs"
                  disabled={pending}
                  onClick={() => window.confirm("Старый адрес перестанет работать. Продолжить?") && run(() => rotateWebhookKeyAction(projectId), (r) => r.webhookUrl && setUrl(r.webhookUrl))}
                >
                  Новый ключ
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={save}>
                {pending ? "Создаю…" : "Создать вебхук"}
              </button>
            )}
          </div>
        </>
      )}

      {type === "kommo" && (
        <>
          <input className="field" placeholder="agency.kommo.com или agency.amocrm.ru" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <input
            className="field"
            type="password"
            autoComplete="off"
            placeholder={current?.hasSecret && cfg?.type === "kommo" ? "Токен сохранён — вставьте новый, чтобы заменить" : "Долгосрочный токен"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Kommo → Настройки → Интеграции → Создать интеграцию (внешняя) → вкладка «Ключи и доступы» → «Долгосрочный токен».
          </p>
          <SaveButton pending={pending} onClick={save} />
        </>
      )}

      {type === "bitrix24" && (
        <>
          <input
            className="field"
            type="password"
            autoComplete="off"
            placeholder={current?.hasSecret && cfg?.type === "bitrix24" ? "Ссылка сохранена — вставьте новую, чтобы заменить" : "https://xxx.bitrix24.ru/rest/1/abc…/"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Bitrix24 → Разработчикам → Другое → Входящий вебхук, права «CRM» и «Пользователи». Скопируйте ссылку вебхука.
          </p>
          <SaveButton pending={pending} onClick={save} />
        </>
      )}
      <Result r={result} />
    </Shell>
  );
}

function SaveButton({ pending, onClick, label = "Проверить и сохранить" }: { pending: boolean; onClick: () => void; label?: string }) {
  return (
    <div>
      <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={onClick}>
        {pending ? "Проверяю…" : label}
      </button>
    </div>
  );
}

/* ---------- Leads sheet ---------- */

function LeadsSheetCard({ projectId, current }: { projectId: string; current?: IntegrationView<"sheets_leads"> }) {
  const cfg = current?.config as SheetsLeadsConfig | undefined;
  const [url, setUrl] = useState(cfg?.url ?? "");
  const [picked, setPicked] = useState<string[]>(cfg ? leadTabsOf(cfg) : []);
  const [salesTab, setSalesTab] = useState(cfg?.salesTab ?? "");
  const [tabs, setTabs] = useState<string[]>([]);
  const { pending, result, run } = useRunner();
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const summary = cfg && `«${cfg.title}» · лиды: ${leadTabsOf(cfg).join(", ")}${cfg.salesTab ? ` · продажи: ${cfg.salesTab}` : ""}`;

  return (
    <Shell kind="sheets_leads" current={current} projectId={projectId} summary={summary}>
      <p className="text-xs leading-5 text-muted-foreground">
        Реальные лиды клиента, даже если кабинет их не видит. Листы с лидами: одна строка — один лид, в первой строке заголовки (Дата, Имя,
        Контакт/Телефон, Статус/Qualification, gclid/Attribution, Дата оплаты, Сумма — какие есть). Лист продаж — суммы по периодам.
      </p>
      <div className="flex gap-2">
        <input className="field" placeholder="Ссылка на Google Таблицу" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button
          type="button"
          className="btn-ghost shrink-0 border border-border px-3 py-1.5 text-xs"
          disabled={pending || !url.trim()}
          onClick={() => run(() => saveLeadsSheetAction(projectId, { url }), (r) => r.tabs && setTabs(r.tabs))}
        >
          Показать листы
        </button>
      </div>
      {tabs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Листы с лидами</span>
            {tabs.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(t)} disabled={t === salesTab} onChange={() => toggle(t)} className="size-4 accent-[var(--accent)]" />
                {t}
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Лист продаж (необязательно)</span>
            <select className="field" value={salesTab} onChange={(e) => setSalesTab(e.target.value)}>
              <option value="">Нет</option>
              {tabs.filter((t) => !picked.includes(t)).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(tabs.length > 0 || cfg) && (
        <SaveButton
          pending={pending}
          label="Сохранить и загрузить"
          onClick={() => run(() => saveLeadsSheetAction(projectId, { url, tabs: picked, salesTab: salesTab || null }), (r) => r.tabs && setTabs(r.tabs))}
        />
      )}
      <Result r={result} />
    </Shell>
  );
}

/* ---------- Daily report ---------- */

function ReportCard({ projectId, current }: { projectId: string; current?: IntegrationView<"sheets_report"> }) {
  const cfg = current?.config as SheetsReportConfig | undefined;
  const [url, setUrl] = useState(cfg?.url ?? "");
  const [title, setTitle] = useState(cfg?.title ?? "");
  const [tabs, setTabs] = useState<(ReportTab & { on: boolean })[]>(cfg?.tabs.map((t) => ({ ...t, on: true })) ?? []);
  const { pending, result, run } = useRunner();

  const patch = (i: number, p: Partial<ReportTab & { on: boolean }>) => setTabs((list) => list.map((t, j) => (j === i ? { ...t, ...p } : t)));

  return (
    <Shell kind="sheets_report" current={current} projectId={projectId} summary={cfg && `«${cfg.title}» · листы: ${cfg.tabs.map((t) => t.tab).join(", ")}`}>
      <p className="text-xs leading-5 text-muted-foreground">
        Каждый день дашборд находит строку с датой в колонке A и вписывает расход, показы, клики, лиды и подписки за последние 3 дня
        (Google досчитывает конверсии задним числом). Формулы и ручные колонки не трогаются; если строки с датой нет, она
        добавляется под последней с теми же формулами и форматом.
      </p>
      {!current && (
        <div>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={() => run(() => createFromTemplateAction(projectId, "report"))}>
            {pending ? "Создаю…" : "Создать из шаблона"}
          </button>
          <span className="ml-2 text-xs text-muted-foreground">или подключите существующую:</span>
        </div>
      )}
      <div className="flex gap-2">
        <input className="field" placeholder="Ссылка на таблицу «Репорт»" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button
          type="button"
          className="btn-ghost shrink-0 border border-border px-3 py-1.5 text-xs"
          disabled={pending || !url}
          onClick={() =>
            run(() => detectReportAction(url), (r) => {
              if (r.report) {
                setTitle(r.report.title);
                setTabs(r.report.tabs.map((t) => ({ ...t, on: true })));
              }
            })
          }
        >
          Найти листы
        </button>
      </div>

      {tabs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Лист</th>
                <th className="py-1 pr-2 font-medium">Данные</th>
                {REPORT_METRICS.map((m) => (
                  <th key={m} className="py-1 pr-1 font-medium">
                    {REPORT_METRIC_LABELS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabs.map((t, i) => (
                <tr key={t.tab}>
                  <td className="py-1 pr-2">
                    <label className="flex items-center gap-1.5 whitespace-nowrap">
                      <input type="checkbox" checked={t.on} onChange={(e) => patch(i, { on: e.target.checked })} className="accent-[var(--accent)]" />
                      {t.tab}
                    </label>
                  </td>
                  <td className="py-1 pr-2">
                    <select className="field w-auto px-2 py-1 text-xs" value={t.platform} onChange={(e) => patch(i, { platform: e.target.value as ReportTab["platform"] })}>
                      <option value="google">Google</option>
                      <option value="meta">Meta</option>
                      <option value="all">Все</option>
                    </select>
                  </td>
                  {REPORT_METRICS.map((m) => (
                    <td key={m} className="py-1 pr-1">
                      <input
                        className="field w-11 px-1.5 py-1 text-center text-xs uppercase"
                        maxLength={2}
                        placeholder="—"
                        value={t.columns[m] ?? ""}
                        onChange={(e) => patch(i, { columns: { ...t.columns, [m]: e.target.value.toUpperCase() } })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted-foreground">Буквы колонок найдены по заголовкам, их можно поправить. Пусто — не заполнять.</p>
        </div>
      )}
      {tabs.length > 0 && (
        <SaveButton
          pending={pending}
          label="Сохранить и заполнить"
          onClick={() => run(() => saveReportAction(projectId, { url, title, tabs: tabs.filter((t) => t.on) }))}
        />
      )}
      <Result r={result} />
    </Shell>
  );
}

/* ---------- Drive ---------- */

function DriveCard({ projectId, current }: { projectId: string; current?: IntegrationView<"drive"> }) {
  const cfg = current?.config as DriveConfig | undefined;
  const [url, setUrl] = useState(cfg?.url ?? "");
  const { pending, result, run } = useRunner();

  return (
    <Shell kind="drive" current={current} projectId={projectId} summary={cfg && `Папка «${cfg.name}»`}>
      <p className="text-xs leading-5 text-muted-foreground">
        Сюда уходит контент, созданный в дашборде, и отсюда берутся исходники. Новая папка создаётся копией «Template Project» в
        PROFITAD → PROJECTS.
      </p>
      {!current && (
        <div>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={() => run(() => createFromTemplateAction(projectId, "drive"))}>
            {pending ? "Создаю…" : "Создать папку из шаблона"}
          </button>
          <span className="ml-2 text-xs text-muted-foreground">или укажите существующую:</span>
        </div>
      )}
      <input className="field" placeholder="Ссылка на папку Google Drive" value={url} onChange={(e) => setUrl(e.target.value)} />
      <SaveButton pending={pending} onClick={() => run(() => saveDriveAction(projectId, { url }))} />
      <Result r={result} />
    </Shell>
  );
}
