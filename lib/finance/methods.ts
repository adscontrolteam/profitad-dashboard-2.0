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

/** A FOP's details in English, for the «INVOICE» issued to foreign clients. */
export const EN_FIELDS: { key: string; label: string; placeholder?: string; multiline?: boolean }[] = [
  { key: "nameEn", label: "Name", placeholder: "FOP Surname Name Patronymic" },
  { key: "addressEn", label: "Address", placeholder: "Kyiv, …, Ukraine" },
  { key: "ibanCurrency", label: "Account currency", placeholder: "UAH" },
  { key: "bankEn", label: "Beneficiary bank", placeholder: "JSC UNIVERSAL BANK" },
  { key: "swift", label: "SWIFT/BIC" },
  { key: "bankAddressEn", label: "Bank address" },
  { key: "correspondents", label: "Correspondent banks", placeholder: "One per line: Bank — SWIFT/BIC: XXXX", multiline: true },
];

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred` + (n % 100 ? ` ${words(n % 100)}` : "");
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (n >= size) return `${words(Math.floor(n / size))} ${name}` + (n % size ? ` ${words(n % size)}` : "");
  }
  return String(n);
}

const UNITS: Record<string, [string, string, string]> = {
  EUR: ["euro", "euros", "cents"],
  USD: ["US dollar", "US dollars", "cents"],
  UAH: ["hryvnia", "hryvnias", "kopiykas"],
  PLN: ["zloty", "zlotys", "groszy"],
  USDT: ["USDT", "USDT", "cents"],
};

/** «Six hundred fifty euros.» */
export function amountInWords(amount: number, currency: string) {
  const whole = Math.floor(Math.round(amount * 100) / 100);
  const cents = Math.round(amount * 100) - whole * 100;
  const [one, many, minor] = UNITS[currency] ?? [currency, currency, "cents"];
  const text = `${words(whole)} ${whole === 1 ? one : many}` + (cents ? ` and ${words(cents)} ${minor}` : "");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

export const formatAmountEn = (v: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v).replace(/,/g, " ");

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** «28 September 2026» */
export const dateEn = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_EN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

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
