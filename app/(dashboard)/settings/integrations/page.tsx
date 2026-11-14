import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { requireAccessManager } from "@/lib/access/viewer";
import { cn } from "@/lib/cn";
import { hasEncryptionKey } from "@/lib/crypto";
import { getProjects } from "@/lib/data";
import { adsConfigured, listAccounts, mccId } from "@/lib/google/ads";
import { serviceAccountEmail, workspaceUser } from "@/lib/google/auth";
import { INTEGRATION_LABELS } from "@/lib/integrations/kinds";
import { listIntegrations } from "@/lib/integrations/store";

import { metaAdAccounts, metaConfigured } from "@/lib/meta/ads";

export const metadata: Metadata = { title: "Подключения" };

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }) : "—";

export default async function IntegrationsSettingsPage() {
  await requireAccessManager();
  const sa = serviceAccountEmail();
  const ads = adsConfigured()
    ? await listAccounts()
        .then((accounts) => ({ ok: true as const, accounts }))
        .catch((e: Error) => ({ ok: false as const, error: e.message }))
    : null;
  const meta = metaConfigured()
    ? await metaAdAccounts()
        .then((accounts) => ({ ok: true as const, accounts }))
        .catch((e: Error) => ({ ok: false as const, error: e.message }))
    : null;
  const [integrations, projects, log] = await Promise.all([
    listIntegrations(),
    getProjects(),
    getDb().select().from(auditLog).orderBy(desc(auditLog.at)).limit(25),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const checks: { label: string; ok: boolean; detail: string }[] = [
    { label: "Сервис-аккаунт Google", ok: Boolean(sa), detail: sa ?? "GOOGLE_SERVICE_ACCOUNT_JSON не задан" },
    {
      label: "Google Ads API",
      ok: Boolean(ads?.ok),
      detail: !ads
        ? "Нужны GOOGLE_ADS_DEVELOPER_TOKEN и GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC)"
        : ads.ok
          ? `MCC ${mccId()}: кабинетов под управлением — ${ads.accounts.length}`
          : `Ошибка: ${ads.error}`,
    },
    {
      label: "Google Workspace (Drive и Таблицы)",
      ok: Boolean(workspaceUser()),
      detail: workspaceUser()
        ? `Работаем от имени ${workspaceUser()} (делегирование на уровне домена)`
        : "GOOGLE_WORKSPACE_USER не задан — файлы будет создавать сам сервис-аккаунт, а у него нет места на Drive",
    },
    { label: "Шифрование секретов", ok: hasEncryptionKey(), detail: hasEncryptionKey() ? "TOKEN_ENCRYPTION_KEY задан" : "TOKEN_ENCRYPTION_KEY не задан — CRM-токены сохранить нельзя" },
    { label: "Ежедневная синхронизация", ok: Boolean(process.env.CRON_SECRET), detail: process.env.CRON_SECRET ? "CRON_SECRET задан, запуск каждый день в 05:00 UTC" : "CRON_SECRET не задан — Vercel Cron не сможет запускать синк" },
    {
      label: "Meta Ads API (чтение статистики)",
      ok: Boolean(meta?.ok),
      detail: !meta
        ? "Нужен META_SYSTEM_USER_TOKEN — токен System User нашего Business Manager с ads_read на кабинеты клиентов"
        : meta.ok
          ? `Кабинетов доступно: ${meta.accounts.length}${meta.accounts.length ? ` (${meta.accounts.slice(0, 5).map((a) => a.name).join(", ")}${meta.accounts.length > 5 ? "…" : ""})` : ""}`
          : `Ошибка: ${meta.error}`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="min-w-0">
        <h2 className="section-title">Ключи и доступы агентства</h2>
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 py-3">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", c.ok ? "bg-positive" : "bg-warning")} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{c.label}</p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Ключи задаются в Vercel → Settings → Environment Variables. Инструкция — docs/integrations.md в репозитории.
        </p>
      </Card>

      <Card className="min-w-0">
        <h2 className="section-title">Подключения проектов</h2>
        {integrations.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Пока ничего не подключено. Подключения настраиваются в карточке проекта во «Вводных».</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Проект</th>
                  <th className="py-2 pr-3 font-medium">Подключение</th>
                  <th className="py-2 pr-3 font-medium">Последняя синхронизация</th>
                  <th className="py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {integrations.map((i) => (
                  <tr key={`${i.projectId}:${i.kind}`}>
                    <td className="py-2.5 pr-3 font-semibold">{projectName.get(i.projectId) ?? i.projectId}</td>
                    <td className="py-2.5 pr-3">{INTEGRATION_LABELS[i.kind]}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{fmt(i.lastSyncAt)}</td>
                    <td className={cn("py-2.5 text-xs", i.status === "error" ? "text-negative" : i.status === "ok" ? "text-positive" : "text-muted-foreground")}>
                      {i.status === "error" ? i.lastError : i.status === "ok" ? "работает" : "ждёт первой синхронизации"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="min-w-0">
        <h2 className="section-title">Журнал действий</h2>
        <p className="mt-1 text-sm text-muted-foreground">Всё, что дашборд менял во внешних системах: кампании, подключения, загрузки.</p>
        {log.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Записей пока нет.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-border text-sm">
            {log.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">{fmt(e.at)}</span>
                <span className={cn("font-medium", !e.ok && "text-negative")}>{e.action}</span>
                <span className="text-xs text-muted-foreground">
                  {e.projectId ? (projectName.get(e.projectId) ?? e.projectId) : ""} {e.target} · {e.actorEmail}
                </span>
                {e.result && <span className="basis-full text-xs text-muted-foreground sm:pl-31">{e.result}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
