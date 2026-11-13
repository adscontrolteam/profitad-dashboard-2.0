export const INTEGRATION_KINDS = ["crm", "sheets_leads", "sheets_report", "drive"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const CRM_TYPES = ["webhook", "kommo", "bitrix24"] as const;
export type CrmType = (typeof CRM_TYPES)[number];

export const CRM_LABELS: Record<CrmType, string> = {
  webhook: "Вебхук (любая CRM или форма)",
  kommo: "Kommo / amoCRM",
  bitrix24: "Bitrix24",
};

export const INTEGRATION_LABELS: Record<IntegrationKind, string> = {
  crm: "CRM",
  sheets_leads: "Google Таблица с лидами",
  sheets_report: "Google Таблица «Репорт»",
  drive: "Google Drive — папка контента",
};

export const isIntegrationKind = (v: unknown): v is IntegrationKind => INTEGRATION_KINDS.includes(v as IntegrationKind);
export const isCrmType = (v: unknown): v is CrmType => CRM_TYPES.includes(v as CrmType);
