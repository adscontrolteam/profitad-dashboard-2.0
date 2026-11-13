"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requireCapability, type Viewer } from "@/lib/access/viewer";
import { audit } from "@/lib/audit";
import { randomToken } from "@/lib/crypto";
import { GoogleApiError, GoogleNotConfigured } from "@/lib/google/auth";
import { folderInfo, parseFolderId } from "@/lib/google/drive";
import { parseSpreadsheetId, spreadsheetInfo } from "@/lib/google/sheets";
import { testBitrix, testKommo } from "@/lib/integrations/crm";
import { isCrmType, isIntegrationKind, type CrmType, type IntegrationKind } from "@/lib/integrations/kinds";
import { syncIntegration } from "@/lib/integrations/run";
import { detectReport } from "@/lib/integrations/sheets";
import { deleteIntegration, getIntegration, readSecret, saveIntegration } from "@/lib/integrations/store";
import { REPORT_METRICS, type ReportTab } from "@/lib/integrations/types";
import { ensureProjectFolder, ensureReport } from "@/lib/integrations/provision";
import { getProject } from "@/lib/data";

export interface IntegrationResult {
  ok: boolean;
  message: string;
  /** Webhook address with its key — returned only to the admin who asked for it. */
  webhookUrl?: string;
  tabs?: string[];
  report?: { title: string; tabs: ReportTab[] };
}

const admin = () => requireCapability("inputs", "canEditInputs");

function explain(error: unknown) {
  if (error instanceof GoogleNotConfigured) return error.message;
  if (error instanceof GoogleApiError) {
    if (/storage ?quota/i.test(error.message)) {
      return "У сервис-аккаунта нет места на Drive: нужно делегирование на уровне домена (GOOGLE_WORKSPACE_USER).";
    }
    if (error.status === 403 || error.status === 404) {
      return "Нет доступа: откройте доступ сервис-аккаунту (его почта — в «Настройки → Подключения») с правами редактора.";
    }
    return `Google: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Неизвестная ошибка";
}

async function webhookUrl(projectId: string, key: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/integrations/leads/${projectId}?key=${key}`;
}

async function trySync(projectId: string, kind: IntegrationKind) {
  const rec = await getIntegration(projectId, kind);
  if (!rec) return "";
  try {
    return await syncIntegration(rec);
  } catch (error) {
    return `Сохранено, но первая синхронизация не прошла: ${explain(error)}`;
  }
}

async function done(viewer: Viewer, action: string, projectId: string, result: IntegrationResult): Promise<IntegrationResult> {
  await audit({ actorEmail: viewer.email, action, projectId, ok: result.ok, result: result.message });
  refresh();
  return result;
}

/* ---------- CRM ---------- */

export async function saveCrmAction(projectId: string, input: { type: CrmType; domain?: string; secret?: string }): Promise<IntegrationResult> {
  const viewer = await admin();
  if (!isCrmType(input.type)) return { ok: false, message: "Выберите тип CRM." };
  const secret = (input.secret ?? "").trim();

  try {
    if (input.type === "webhook") {
      const existing = await getIntegration(projectId, "crm");
      const key = existing && existing.config.type === "webhook" ? readSecret(existing) : null;
      const finalKey = key ?? randomToken();
      await saveIntegration(projectId, "crm", { type: "webhook" }, key ? undefined : finalKey, viewer.email);
      return done(viewer, "integration.crm.webhook", projectId, {
        ok: true,
        message: "Вебхук готов. Передайте адрес в CRM или форму — лиды будут приходить сразу.",
        webhookUrl: await webhookUrl(projectId, finalKey),
      });
    }

    if (input.type === "kommo") {
      const domain = (input.domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!/\.(kommo\.com|amocrm\.ru|amocrm\.com)$/.test(domain)) return { ok: false, message: "Домен вида agency.kommo.com или agency.amocrm.ru" };
      const existing = await getIntegration(projectId, "crm");
      const token = secret || (existing?.config.type === "kommo" ? readSecret(existing) : null);
      if (!token) return { ok: false, message: "Вставьте долгосрочный токен интеграции Kommo." };
      const name = await testKommo(domain, token);
      await saveIntegration(projectId, "crm", { type: "kommo", domain }, secret || undefined, viewer.email);
      const sync = await trySync(projectId, "crm");
      return done(viewer, "integration.crm.kommo", projectId, { ok: true, message: `Kommo «${name}» подключена. ${sync}` });
    }

    const existing = await getIntegration(projectId, "crm");
    const url = secret || (existing?.config.type === "bitrix24" ? readSecret(existing) : null);
    if (!url) return { ok: false, message: "Вставьте ссылку входящего вебхука Bitrix24." };
    const name = await testBitrix(url);
    await saveIntegration(projectId, "crm", { type: "bitrix24" }, secret || undefined, viewer.email);
    const sync = await trySync(projectId, "crm");
    return done(viewer, "integration.crm.bitrix24", projectId, { ok: true, message: `Bitrix24 ${name} подключён. ${sync}` });
  } catch (error) {
    return done(viewer, `integration.crm.${input.type}`, projectId, { ok: false, message: explain(error) });
  }
}

export async function revealWebhookAction(projectId: string): Promise<IntegrationResult> {
  const viewer = await admin();
  const rec = await getIntegration(projectId, "crm");
  const key = rec && rec.config.type === "webhook" ? readSecret(rec) : null;
  if (!key) return { ok: false, message: "Вебхук не настроен." };
  await audit({ actorEmail: viewer.email, action: "integration.crm.reveal", projectId, ok: true });
  return { ok: true, message: "", webhookUrl: await webhookUrl(projectId, key) };
}

export async function rotateWebhookKeyAction(projectId: string): Promise<IntegrationResult> {
  const viewer = await admin();
  const key = randomToken();
  await saveIntegration(projectId, "crm", { type: "webhook" }, key, viewer.email);
  return done(viewer, "integration.crm.rotate", projectId, {
    ok: true,
    message: "Новый ключ создан, старый адрес больше не принимает лиды.",
    webhookUrl: await webhookUrl(projectId, key),
  });
}

/* ---------- Google Sheets ---------- */

export async function saveLeadsSheetAction(projectId: string, input: { url: string; tab?: string }): Promise<IntegrationResult> {
  const viewer = await admin();
  const spreadsheetId = parseSpreadsheetId(input.url);
  if (!spreadsheetId) return { ok: false, message: "Вставьте ссылку на Google Таблицу." };
  try {
    const info = await spreadsheetInfo(spreadsheetId);
    const tab = input.tab && info.tabs.includes(input.tab) ? input.tab : info.tabs.length === 1 ? info.tabs[0] : null;
    if (!tab) return { ok: false, message: "Выберите лист с лидами.", tabs: info.tabs };
    await saveIntegration(projectId, "sheets_leads", { url: input.url.trim(), spreadsheetId, title: info.title, tab }, null, viewer.email);
    const sync = await trySync(projectId, "sheets_leads");
    return done(viewer, "integration.sheets_leads", projectId, { ok: true, message: `«${info.title}» · ${tab} подключена. ${sync}` });
  } catch (error) {
    return done(viewer, "integration.sheets_leads", projectId, { ok: false, message: explain(error) });
  }
}

/** Reads the report template and proposes tabs/columns to fill; nothing is saved yet. */
export async function detectReportAction(url: string): Promise<IntegrationResult> {
  await admin();
  const spreadsheetId = parseSpreadsheetId(url);
  if (!spreadsheetId) return { ok: false, message: "Вставьте ссылку на Google Таблицу." };
  try {
    const report = await detectReport(spreadsheetId);
    if (report.tabs.length === 0) return { ok: false, message: "Не нашли листов с колонкой DATE/Дата в первой строке." };
    return { ok: true, message: "", report };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export async function saveReportAction(projectId: string, input: { url: string; title: string; tabs: ReportTab[] }): Promise<IntegrationResult> {
  const viewer = await admin();
  const spreadsheetId = parseSpreadsheetId(input.url);
  if (!spreadsheetId) return { ok: false, message: "Вставьте ссылку на Google Таблицу." };
  const tabs = input.tabs
    .filter((t) => t.tab && ["google", "meta", "all"].includes(t.platform))
    .map((t) => ({
      tab: t.tab,
      platform: t.platform,
      columns: Object.fromEntries(
        REPORT_METRICS.filter((m) => /^[A-Z]{1,2}$/.test(t.columns[m] ?? "")).map((m) => [m, t.columns[m] as string]),
      ),
    }));
  if (tabs.length === 0) return { ok: false, message: "Отметьте хотя бы один лист." };
  await saveIntegration(projectId, "sheets_report", { url: input.url.trim(), spreadsheetId, title: input.title, tabs }, null, viewer.email);
  const sync = await trySync(projectId, "sheets_report");
  return done(viewer, "integration.sheets_report", projectId, { ok: true, message: `Репорт подключён. ${sync}` });
}

/* ---------- Google Drive ---------- */

export async function saveDriveAction(projectId: string, input: { url: string }): Promise<IntegrationResult> {
  const viewer = await admin();
  const folderId = parseFolderId(input.url);
  if (!folderId) return { ok: false, message: "Вставьте ссылку на папку Google Drive." };
  try {
    const folder = await folderInfo(folderId);
    if (folder.mimeType !== "application/vnd.google-apps.folder") return { ok: false, message: "Это не папка." };
    await saveIntegration(projectId, "drive", { url: input.url.trim(), folderId, name: folder.name }, null, viewer.email);
    await syncIntegration((await getIntegration(projectId, "drive"))!);
    const note = folder.driveId ? "" : " Папка не на общем диске: читать можно, но загрузка из дашборда не сработает — перенесите её в Shared Drive.";
    return done(viewer, "integration.drive", projectId, { ok: true, message: `Папка «${folder.name}» подключена.${note}` });
  } catch (error) {
    return done(viewer, "integration.drive", projectId, { ok: false, message: explain(error) });
  }
}

/* ---------- Common ---------- */

export async function syncNowAction(projectId: string, kind: IntegrationKind): Promise<IntegrationResult> {
  const viewer = await admin();
  if (!isIntegrationKind(kind)) return { ok: false, message: "Неизвестное подключение." };
  const rec = await getIntegration(projectId, kind);
  if (!rec) return { ok: false, message: "Не подключено." };
  try {
    return done(viewer, `integration.${kind}.sync`, projectId, { ok: true, message: await syncIntegration(rec) });
  } catch (error) {
    return done(viewer, `integration.${kind}.sync`, projectId, { ok: false, message: explain(error) });
  }
}

export async function disconnectAction(projectId: string, kind: IntegrationKind): Promise<IntegrationResult> {
  const viewer = await admin();
  if (!isIntegrationKind(kind)) return { ok: false, message: "Неизвестное подключение." };
  await deleteIntegration(projectId, kind);
  return done(viewer, `integration.${kind}.disconnect`, projectId, { ok: true, message: "Отключено." });
}

/* ---------- From templates ---------- */

export async function createFromTemplateAction(projectId: string, what: "drive" | "report"): Promise<IntegrationResult> {
  const viewer = await admin();
  const project = await getProject(projectId);
  if (!project) return { ok: false, message: "Проект не найден." };
  try {
    if (what === "report") {
      const r = await ensureReport(projectId, project.name, viewer.email);
      const sync = await trySync(projectId, "sheets_report");
      return done(viewer, "integration.sheets_report.template", projectId, {
        ok: true,
        message: `${r.created ? "Репорт создан из шаблона" : "Найден существующий Репорт, подключён"}. ${sync}`,
      });
    }
    const r = await ensureProjectFolder(projectId, project.name, viewer.email);
    return done(viewer, "integration.drive.template", projectId, {
      ok: true,
      message: r.created ? "Папка проекта создана из шаблона." : "Найдена существующая папка проекта, подключена.",
    });
  } catch (error) {
    return done(viewer, `integration.${what}.template`, projectId, { ok: false, message: explain(error) });
  }
}
