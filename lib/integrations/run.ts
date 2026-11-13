import "server-only";
import { revalidateTag } from "next/cache";
import { TAGS } from "@/lib/data/tags";
import { pullBitrix, pullKommo } from "./crm";
import { readLeadsSheet, writeReport } from "./sheets";
import { listIntegrations, markIntegration, readSecret, upsertLeads, type IntegrationRecord } from "./store";
import type { CrmConfig, SheetsLeadsConfig, SheetsReportConfig } from "./types";

const DAY = 86_400_000;

/** One sync of one integration. Returns a short human result; stores ok/error on the integration. */
export async function syncIntegration(rec: IntegrationRecord): Promise<string> {
  try {
    const message = await run(rec);
    await markIntegration(rec.projectId, rec.kind, null);
    revalidateTag(TAGS.project(rec.projectId), "max");
    return message;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markIntegration(rec.projectId, rec.kind, message);
    throw new Error(message);
  }
}

async function run(rec: IntegrationRecord): Promise<string> {
  switch (rec.kind) {
    case "crm": {
      const cfg = rec.config as CrmConfig;
      if (cfg.type === "webhook") return "Вебхук принимает лиды сам — синхронизация не нужна.";
      const secret = readSecret(rec);
      if (!secret) throw new Error("Не сохранён токен или ссылка вебхука CRM.");
      // First run takes 90 days of history, then a window that overlaps the previous sync.
      const since = rec.lastSyncAt ? new Date(rec.lastSyncAt.getTime() - 2 * 3600_000) : new Date(Date.now() - 90 * DAY);
      const items = cfg.type === "kommo" ? await pullKommo(cfg.domain ?? "", secret, since) : await pullBitrix(secret, since);
      const n = await upsertLeads(rec.projectId, cfg.type, items);
      return `Лидов загружено/обновлено: ${n}`;
    }
    case "sheets_leads": {
      const { leads, columns } = await readLeadsSheet(rec.config as SheetsLeadsConfig);
      if (!columns.includes("date") && !columns.includes("phone") && !columns.includes("name")) {
        throw new Error("В первой строке не нашли колонок «Дата», «Имя» или «Телефон».");
      }
      const n = await upsertLeads(rec.projectId, "sheet", leads);
      return `Строк с лидами: ${n}`;
    }
    case "sheets_report": {
      const cells = await writeReport(rec.projectId, rec.config as SheetsReportConfig, 3);
      return cells ? `Заполнено ячеек: ${cells}` : "Новых данных за последние 3 дня нет — таблица не менялась.";
    }
    case "drive":
      return "Папка подключена.";
  }
}

/** Cron entry point: every integration of every project, errors collected per integration. */
export async function syncAll() {
  const all = await listIntegrations();
  const results: { projectId: string; kind: string; ok: boolean; message: string }[] = [];
  for (const rec of all) {
    if (rec.kind === "drive" || (rec.kind === "crm" && (rec.config as CrmConfig).type === "webhook")) continue;
    try {
      results.push({ projectId: rec.projectId, kind: rec.kind, ok: true, message: await syncIntegration(rec) });
    } catch (error) {
      results.push({ projectId: rec.projectId, kind: rec.kind, ok: false, message: (error as Error).message });
    }
  }
  return results;
}
