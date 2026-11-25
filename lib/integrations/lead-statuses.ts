import "server-only";
import { googleFetch, SCOPES } from "@/lib/google/auth";
import { batchUpdate } from "@/lib/google/sheets";

/**
 * The agency's lead statuses: every lead tab has a «Qualification» column with this dropdown and these colours.
 * Same eight stages in both languages; a sheet keeps the language it already uses, new sheets get Russian.
 * The texts are read back by classifyStatus (lead-sheet.ts) — change them there too.
 */
const hex = (h: string) => ({ red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255 });

export const LEAD_STATUSES: { ru: string; uk: string; color: string }[] = [
  { ru: "Новый", uk: "Новий", color: "#D6E6FF" },
  { ru: "Не отвечает", uk: "Не відповідає", color: "#FFE2C7" },
  { ru: "Жду ответ / В работе", uk: "Чекаю відповідь", color: "#FFF2B8" },
  { ru: "Оплатил", uk: "Оплатив", color: "#C6EBC9" },
  { ru: "Отложил (вернётся позже)", uk: "Відклав (повернеться пізніше)", color: "#E5DBF7" },
  { ru: "Отказ / не актуально", uk: "Відмова / не актуально", color: "#F8D2D0" },
  { ru: "Нецелевой", uk: "Нецільовий", color: "#E2E2E2" },
  { ru: "Спам", uk: "Спам", color: "#C8C8C8" },
];

const HINT = {
  ru: "Текущий этап лида. Когда меняется — перезаписывайте. Оплата: «Оплатил» + дата оплаты и сумма. Причину пишите в комментарий.",
  uk: "Поточний етап ліда. Коли змінюється — перезаписуйте. Оплата: «Оплатив» + Дата оплати і Сума.",
};

type Lang = "ru" | "uk";
interface Grid {
  sheets?: {
    properties: { title: string; sheetId: number; gridProperties?: { rowCount?: number } };
    conditionalFormats?: { ranges?: { startColumnIndex?: number; endColumnIndex?: number }[] }[];
    data?: { rowData?: { values?: { formattedValue?: string; dataValidation?: { condition?: { values?: { userEnteredValue?: string }[] } } }[] }[] }[];
  }[];
}

/**
 * Makes the «Qualification» column of a lead tab follow the standard: dropdown of the eight statuses and a colour per status.
 * Safe to run again: a column that already has the dropdown keeps it (and its language), colours are added only when missing.
 */
export async function ensureLeadStatuses(spreadsheetId: string, tab: string): Promise<"done" | "ok" | "no-column"> {
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A1:AZ2`);
  const data = await googleFetch<Grid>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${range}&fields=sheets(properties(title,sheetId,gridProperties.rowCount),conditionalFormats.ranges,data.rowData.values(formattedValue,dataValidation.condition.values))`,
    [SCOPES.sheets],
    {},
    { asWorkspaceUser: true },
  );
  const sheet = data.sheets?.find((s) => s.properties.title === tab);
  const rows = sheet?.data?.[0]?.rowData ?? [];
  const col = (rows[0]?.values ?? []).findIndex((c) => /^qualification$/i.test((c.formattedValue ?? "").trim()));
  if (!sheet || col < 0) return "no-column";

  const listed = rows[1]?.values?.[col]?.dataValidation?.condition?.values?.map((v) => v.userEnteredValue ?? "") ?? [];
  const lang: Lang = listed.includes("Новий") ? "uk" : "ru";
  const hasList = LEAD_STATUSES.every((s) => listed.includes(s[lang]));
  const hasColors = (sheet.conditionalFormats ?? []).some((f) => f.ranges?.some((r) => (r.startColumnIndex ?? 0) <= col && (r.endColumnIndex ?? Infinity) > col));
  if (hasList && hasColors) return "ok";

  const cells = { sheetId: sheet.properties.sheetId, startRowIndex: 1, endRowIndex: Math.max(1000, sheet.properties.gridProperties?.rowCount ?? 0), startColumnIndex: col, endColumnIndex: col + 1 };
  const requests: object[] = [];
  if (!hasList) {
    requests.push({
      setDataValidation: {
        range: cells,
        rule: { condition: { type: "ONE_OF_LIST", values: LEAD_STATUSES.map((s) => ({ userEnteredValue: s[lang] })) }, inputMessage: HINT[lang], strict: true, showCustomUi: true },
      },
    });
  }
  if (!hasColors) {
    LEAD_STATUSES.forEach((s, index) =>
      requests.push({
        addConditionalFormatRule: {
          index,
          rule: { ranges: [cells], booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: s[lang] }] }, format: { backgroundColor: hex(s.color) } } },
        },
      }),
    );
  }
  await batchUpdate(spreadsheetId, requests);
  return "done";
}
