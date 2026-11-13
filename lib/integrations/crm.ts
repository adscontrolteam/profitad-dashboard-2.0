import "server-only";
import { createHash } from "node:crypto";
import type { NormalizedLead } from "./types";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

function pick(obj: Record<string, unknown>, ...keys: string[]) {
  const lower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (v !== undefined && v !== null && str(v) !== "") return v;
  }
  return undefined;
}

function toDate(v: unknown): Date {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  const s = str(v);
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
    const [d, m, rest] = s.split(".");
    const [y, time = "00:00"] = rest.split(/[ T]/);
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${time.length === 5 ? `${time}:00` : time}Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const date = s ? new Date(s) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export const fingerprint = (...parts: unknown[]) =>
  createHash("sha256").update(parts.map(str).join("|")).digest("hex").slice(0, 32);

function outcomeFrom(status: string): NormalizedLead["outcome"] {
  const s = status.toLowerCase();
  if (/(won|успех|успеш|оплач|продаж|closed won|клиент)/.test(s)) return "won";
  if (/(lost|отказ|закрыт|не реализ|проигр)/.test(s)) return "lost";
  if (/(junk|спам|мусор|дубл|некачеств)/.test(s)) return "junk";
  if (/(квалиф|qualif|встреч|переговор|в работе)/.test(s)) return "qualified";
  return "new";
}

/* ---------- Universal webhook ---------- */

/**
 * Accepts the usual shapes CRMs and forms send: flat JSON, an array, or {lead: {...}} / {data: {...}}.
 * Known keys in several spellings; everything else is kept in `raw`.
 */
export function normalizeWebhook(body: unknown): NormalizedLead[] {
  const items = Array.isArray(body)
    ? body
    : body && typeof body === "object"
      ? [((body as Record<string, unknown>).lead ?? (body as Record<string, unknown>).data ?? body) as unknown]
      : [];

  return items
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((o) => {
      const utm: Record<string, string> = {};
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
        const v = pick(o, k);
        if (v !== undefined) utm[k] = str(v);
      }
      const status = str(pick(o, "status", "stage", "статус"));
      const name = str(pick(o, "name", "full_name", "имя", "fio", "client_name"));
      const phone = str(pick(o, "phone", "телефон", "tel", "phone_number"));
      const email = str(pick(o, "email", "e-mail", "почта", "mail"));
      const leadAt = toDate(pick(o, "created_at", "date", "datetime", "timestamp", "дата"));
      const value = Number(str(pick(o, "value", "price", "amount", "sum", "сумма")).replace(",", "."));
      return {
        externalId: str(pick(o, "id", "lead_id", "external_id")) || fingerprint(leadAt.toISOString(), name, phone, email),
        leadAt,
        name,
        phone,
        email,
        status,
        outcome: outcomeFrom(status),
        value: Number.isFinite(value) && value > 0 ? value : null,
        campaign: str(pick(o, "campaign", "utm_campaign", "источник", "source")),
        utm,
        raw: o,
      } satisfies NormalizedLead;
    });
}

/* ---------- Kommo / amoCRM ---------- */

interface KommoLead {
  id: number;
  name?: string;
  price?: number;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  custom_fields_values?: { field_code?: string; field_name?: string; values?: { value?: unknown }[] }[] | null;
  _embedded?: { contacts?: { id: number; is_main?: boolean }[] };
}

const kommoBase = (domain: string) => `https://${domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;

async function kommoGet<T>(domain: string, token: string, path: string): Promise<T | null> {
  const res = await fetch(`${kommoBase(domain)}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 204) return null;
  if (res.status === 401) throw new Error("Kommo отклонил токен (401): проверьте долгосрочный токен интеграции.");
  if (!res.ok) throw new Error(`Kommo ответил ${res.status}`);
  return (await res.json()) as T;
}

export async function testKommo(domain: string, token: string) {
  const acc = await kommoGet<{ name?: string }>(domain, token, "/api/v4/account");
  return acc?.name ?? domain;
}

export async function pullKommo(domain: string, token: string, since: Date): Promise<NormalizedLead[]> {
  const pipelines = await kommoGet<{ _embedded?: { pipelines?: { id: number; _embedded?: { statuses?: { id: number; name: string }[] } }[] } }>(
    domain,
    token,
    "/api/v4/leads/pipelines",
  );
  const statusName = new Map<string, string>();
  for (const p of pipelines?._embedded?.pipelines ?? []) {
    for (const s of p._embedded?.statuses ?? []) statusName.set(`${p.id}:${s.id}`, s.name);
  }

  const out: KommoLead[] = [];
  const from = Math.floor(since.getTime() / 1000);
  for (let page = 1; page <= 40; page++) {
    const data = await kommoGet<{ _embedded?: { leads?: KommoLead[] } }>(
      domain,
      token,
      `/api/v4/leads?with=contacts&limit=250&page=${page}&filter[updated_at][from]=${from}`,
    );
    const batch = data?._embedded?.leads ?? [];
    out.push(...batch);
    if (batch.length < 250) break;
  }

  // Phone and email live on the main contact.
  const contactIds = [...new Set(out.flatMap((l) => l._embedded?.contacts?.filter((c) => c.is_main).map((c) => c.id) ?? []))];
  const contacts = new Map<number, { name: string; phone: string; email: string }>();
  for (let i = 0; i < contactIds.length; i += 200) {
    const ids = contactIds.slice(i, i + 200).map((id) => `filter[id][]=${id}`).join("&");
    const data = await kommoGet<{ _embedded?: { contacts?: { id: number; name?: string; custom_fields_values?: KommoLead["custom_fields_values"] }[] } }>(
      domain,
      token,
      `/api/v4/contacts?limit=250&${ids}`,
    );
    for (const c of data?._embedded?.contacts ?? []) {
      const field = (code: string) => str(c.custom_fields_values?.find((f) => f.field_code === code)?.values?.[0]?.value);
      contacts.set(c.id, { name: c.name ?? "", phone: field("PHONE"), email: field("EMAIL") });
    }
  }

  return out.map((l) => {
    const status = l.status_id === 142 ? "Успешно реализовано" : l.status_id === 143 ? "Закрыто и не реализовано" : (statusName.get(`${l.pipeline_id}:${l.status_id}`) ?? String(l.status_id));
    const utm: Record<string, string> = {};
    for (const f of l.custom_fields_values ?? []) {
      const code = (f.field_code ?? "").toLowerCase();
      if (code.startsWith("utm_")) utm[code] = str(f.values?.[0]?.value);
    }
    const main = l._embedded?.contacts?.find((c) => c.is_main);
    const contact = main ? contacts.get(main.id) : undefined;
    return {
      externalId: String(l.id),
      leadAt: new Date(l.created_at * 1000),
      name: contact?.name || l.name || "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      status,
      outcome: l.status_id === 142 ? "won" : l.status_id === 143 ? "lost" : outcomeFrom(status),
      value: l.price ? l.price : null,
      campaign: utm.utm_campaign ?? "",
      utm,
      raw: { id: l.id, status_id: l.status_id, pipeline_id: l.pipeline_id },
    } satisfies NormalizedLead;
  });
}

/* ---------- Bitrix24 (inbound webhook) ---------- */

function bitrixBase(webhookUrl: string) {
  const u = new URL(webhookUrl.trim());
  if (!/\/rest\/\d+\/[^/]+\/?$/.test(u.pathname)) throw new Error("Нужна ссылка входящего вебхука вида https://xxx.bitrix24.ru/rest/1/abc…/");
  return `${u.origin}${u.pathname.replace(/\/?$/, "/")}`;
}

async function bitrixCall<T>(webhookUrl: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(`${bitrixBase(webhookUrl)}${method}.json`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { result?: T; next?: number; error_description?: string };
  if (!res.ok || data.error_description) throw new Error(`Bitrix24: ${data.error_description ?? res.status}`);
  return data;
}

export async function testBitrix(webhookUrl: string) {
  const data = await bitrixCall<{ NAME?: string; LAST_NAME?: string }>(webhookUrl, "user.current", {});
  return new URL(webhookUrl).host + (data.result?.NAME ? ` · ${data.result.NAME}` : "");
}

export async function pullBitrix(webhookUrl: string, since: Date): Promise<NormalizedLead[]> {
  const statuses = await bitrixCall<{ STATUS_ID: string; NAME: string; SEMANTICS?: string }[]>(webhookUrl, "crm.status.list", {
    filter: { ENTITY_ID: "STATUS" },
  });
  const statusMap = new Map((statuses.result ?? []).map((s) => [s.STATUS_ID, s]));

  type BxLead = {
    ID: string;
    TITLE?: string;
    NAME?: string;
    LAST_NAME?: string;
    STATUS_ID?: string;
    STATUS_SEMANTIC_ID?: string;
    OPPORTUNITY?: string;
    DATE_CREATE?: string;
    UTM_SOURCE?: string;
    UTM_MEDIUM?: string;
    UTM_CAMPAIGN?: string;
    UTM_CONTENT?: string;
    UTM_TERM?: string;
    PHONE?: { VALUE: string }[];
    EMAIL?: { VALUE: string }[];
  };
  const out: BxLead[] = [];
  let start: number | undefined = 0;
  for (let i = 0; i < 40 && start !== undefined; i++) {
    const page: { result?: BxLead[]; next?: number } = await bitrixCall<BxLead[]>(webhookUrl, "crm.lead.list", {
      filter: { ">DATE_MODIFY": since.toISOString() },
      select: ["ID", "TITLE", "NAME", "LAST_NAME", "STATUS_ID", "STATUS_SEMANTIC_ID", "OPPORTUNITY", "DATE_CREATE", "UTM_*", "PHONE", "EMAIL"],
      order: { ID: "ASC" },
      start,
    });
    out.push(...(page.result ?? []));
    start = page.next;
  }

  return out.map((l) => {
    const status = statusMap.get(l.STATUS_ID ?? "")?.NAME ?? l.STATUS_ID ?? "";
    const utm: Record<string, string> = {};
    for (const k of ["UTM_SOURCE", "UTM_MEDIUM", "UTM_CAMPAIGN", "UTM_CONTENT", "UTM_TERM"] as const) {
      if (l[k]) utm[k.toLowerCase()] = l[k] as string;
    }
    const value = Number(l.OPPORTUNITY);
    return {
      externalId: l.ID,
      leadAt: toDate(l.DATE_CREATE),
      name: [l.NAME, l.LAST_NAME].filter(Boolean).join(" ") || l.TITLE || "",
      phone: l.PHONE?.[0]?.VALUE ?? "",
      email: l.EMAIL?.[0]?.VALUE ?? "",
      status,
      outcome: l.STATUS_SEMANTIC_ID === "S" ? "won" : l.STATUS_SEMANTIC_ID === "F" ? "lost" : outcomeFrom(status),
      value: Number.isFinite(value) && value > 0 ? value : null,
      campaign: utm.utm_campaign ?? "",
      utm,
      raw: { ID: l.ID, STATUS_ID: l.STATUS_ID },
    } satisfies NormalizedLead;
  });
}

export { toDate };
