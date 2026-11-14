/** Fields of each kind of payment account, as printed on an invoice (Ukrainian, like the agency's template). */
export type MethodKind = "fop" | "card" | "crypto" | "link";

export const METHOD_KINDS: { value: MethodKind; label: string }[] = [
  { value: "fop", label: "ФОП / IBAN" },
  { value: "card", label: "Карта" },
  { value: "crypto", label: "Крипта" },
  { value: "link", label: "Ссылка на оплату" },
];

export const METHOD_FIELDS: Record<MethodKind, { key: string; label: string; placeholder?: string }[]> = {
  fop: [
    { key: "recipient", label: "Отримувач", placeholder: "ФОП Прізвище Ім'я По батькові" },
    { key: "iban", label: "IBAN", placeholder: "UA…" },
    { key: "taxId", label: "ІПН/ЄДРПОУ" },
    { key: "bank", label: "Банк" },
    { key: "mfo", label: "МФО" },
    { key: "bankCode", label: "ЄДРПОУ Банку" },
  ],
  card: [
    { key: "recipient", label: "Отримувач" },
    { key: "card", label: "Номер картки" },
    { key: "bank", label: "Банк" },
  ],
  crypto: [
    { key: "network", label: "Мережа", placeholder: "TRC20" },
    { key: "wallet", label: "Адреса гаманця" },
  ],
  link: [
    { key: "recipient", label: "Отримувач" },
    { key: "url", label: "Посилання на оплату", placeholder: "Можно вставлять в каждом инвойсе" },
  ],
};

/** Currency label in the amount column, e.g. «Сума, грн». */
export const CURRENCY_WORD: Record<string, string> = { UAH: "грн", USD: "USD", EUR: "EUR", PLN: "PLN", USDT: "USDT" };

export const formatInvoiceAmount = (v: number) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v).replace(/ /g, " ");

const card = (v: string) => v.replace(/\s/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");

/** Rows of the «Отримувач платежу» table. */
export function recipientRows(kind: string, details: Record<string, string>, payLink?: string, currency?: string) {
  const fields = METHOD_FIELDS[(kind as MethodKind) in METHOD_FIELDS ? (kind as MethodKind) : "fop"];
  const rows: { label: string; value: string; href?: string }[] = [];
  for (const f of fields) {
    let value = details[f.key] ?? "";
    if (f.key === "url") value = payLink || value;
    if (!value) continue;
    if (f.key === "card") value = card(value);
    rows.push({ label: f.label, value, href: f.key === "url" ? value : undefined });
    if (kind === "crypto" && f.key === "network" && currency) rows.push({ label: "Валюта", value: currency });
  }
  return rows;
}
