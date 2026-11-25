import "server-only";
import { googleFetch, SCOPES } from "@/lib/google/auth";
import { batchUpdate } from "@/lib/google/sheets";

/**
 * The agency's lead statuses: every lead tab has a «Qualification» column with this dropdown and these colours.
 * Same eight stages in both languages; a sheet keeps the language it already uses, new sheets get Russian.
 * The texts are read back by classifyStatus (lead-sheet.ts) — change them there too.
 */
const hex = (h: string) => ({ red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255 });

export const LEAD_STATUSES: { ru: string; uk: string; color: string; /** Earlier names: cells that still carry them are renamed. */ was?: string[] }[] = [
  { ru: "Новый", uk: "Новий", color: "#D6E6FF" },
  { ru: "Не отвечает", uk: "Не відповідає", color: "#FFE2C7" },
  { ru: "В работе", uk: "В роботі", color: "#DDF3DC", was: ["Жду ответ / В работе", "Чекаю відповідь"] },
  { ru: "Оплатил", uk: "Оплатив", color: "#6FCF7F" },
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
type Rgb = { red?: number; green?: number; blue?: number };
interface Grid {
  sheets?: {
    properties: { title: string; sheetId: number; gridProperties?: { rowCount?: number } };
    conditionalFormats?: {
      ranges?: { startColumnIndex?: number; endColumnIndex?: number }[];
      booleanRule?: { condition?: { type?: string; values?: { userEnteredValue?: string }[] }; format?: { backgroundColor?: Rgb } };
    }[];
    data?: { rowData?: { values?: { formattedValue?: string; dataValidation?: { condition?: { values?: { userEnteredValue?: string }[] } } }[] }[] }[];
  }[];
}

const sameColor = (a: Rgb | undefined, b: Rgb) => (["red", "green", "blue"] as const).every((k) => Math.abs((a?.[k] ?? 0) - (b[k] ?? 0)) < 0.004);

/**
 * Makes the «Qualification» column of a lead tab follow the standard: dropdown of the eight statuses and a colour per status.
 * Safe to run again: a column that already matches is left alone. An outdated one (earlier names or colours) is brought
 * up to date — cells with an earlier name are renamed, the dropdown and the colour rules of the column are replaced.
 * The sheet keeps its language.
 */
export async function ensureLeadStatuses(spreadsheetId: string, tab: string): Promise<"done" | "ok" | "no-column"> {
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A1:AZ5000`);
  const data = await googleFetch<Grid>(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${range}&fields=sheets(properties(title,sheetId,gridProperties.rowCount),conditionalFormats(ranges,booleanRule(condition,format.backgroundColor)),data.rowData.values(formattedValue,dataValidation.condition.values))`,
    [SCOPES.sheets],
    {},
    { asWorkspaceUser: true },
  );
  const sheet = data.sheets?.find((s) => s.properties.title === tab);
  const rows = sheet?.data?.[0]?.rowData ?? [];
  const col = (rows[0]?.values ?? []).findIndex((c) => /^qualification$/i.test((c.formattedValue ?? "").trim()));
  if (!sheet || col < 0) return "no-column";

  const listed = rows[1]?.values?.[col]?.dataValidation?.condition?.values?.map((v) => v.userEnteredValue ?? "") ?? [];
  const lang: Lang = listed.some((v) => LEAD_STATUSES.some((s) => s.uk !== s.ru && s.uk === v)) || listed.includes("Чекаю відповідь") ? "uk" : "ru";
  const names = LEAD_STATUSES.map((s) => s[lang]);
  const hasList = listed.length === names.length && names.every((n, i) => listed[i] === n);

  const onColumn = (f: NonNullable<NonNullable<Grid["sheets"]>[number]["conditionalFormats"]>[number]) =>
    Boolean(f.ranges?.some((r) => (r.startColumnIndex ?? 0) <= col && (r.endColumnIndex ?? Infinity) > col));
  const formats = sheet.conditionalFormats ?? [];
  const mine = formats.map((f, index) => ({ f, index })).filter((x) => onColumn(x.f));
  const hasColors =
    mine.length === LEAD_STATUSES.length &&
    LEAD_STATUSES.every((s) => mine.some((x) => x.f.booleanRule?.condition?.values?.[0]?.userEnteredValue === s[lang] && sameColor(x.f.booleanRule?.format?.backgroundColor, hex(s.color))));

  const rename = new Map(LEAD_STATUSES.flatMap((s) => (s.was ?? []).map((old) => [old, s[lang]] as const)));
  const stale = rows.flatMap((r, i) => {
    const next = i > 0 ? rename.get((r.values?.[col]?.formattedValue ?? "").trim()) : undefined;
    return next ? [{ row: i, value: next }] : [];
  });
  if (hasList && hasColors && stale.length === 0) return "ok";

  const sheetId = sheet.properties.sheetId;
  const cells = { sheetId, startRowIndex: 1, endRowIndex: Math.max(1000, sheet.properties.gridProperties?.rowCount ?? 0), startColumnIndex: col, endColumnIndex: col + 1 };
  const requests: object[] = stale.map((c) => ({
    updateCells: {
      range: { sheetId, startRowIndex: c.row, endRowIndex: c.row + 1, startColumnIndex: col, endColumnIndex: col + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: c.value } }] }],
      fields: "userEnteredValue",
    },
  }));
  if (!hasList) {
    requests.push({
      setDataValidation: {
        range: cells,
        rule: { condition: { type: "ONE_OF_LIST", values: names.map((v) => ({ userEnteredValue: v })) }, inputMessage: HINT[lang], strict: true, showCustomUi: true },
      },
    });
  }
  if (!hasColors) {
    // From the last index down, so the earlier indexes stay valid.
    for (const x of [...mine].reverse()) requests.push({ deleteConditionalFormatRule: { sheetId, index: x.index } });
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
