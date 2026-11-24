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

/* ---------- HubSpot (service key) ---------- */

const HUBSPOT = "https://api.hubapi.com";
/** Date-based API version (HubSpot retires /crm/v3 after September 2027). */
const HUBSPOT_SEARCH = "/crm/objects/2026-09/contacts/search";

const HS_PROPS = [
  "firstname", "lastname", "email", "phone", "mobilephone", "createdate", "lastmodifieddate",
  "lifecyclestage", "hs_lead_status",
  // Money of the closed-won deals linked to the contact — HubSpot keeps these itself.
  "total_revenue", "recent_deal_amount", "num_associated_deals",
  "hs_analytics_source", "hs_analytics_source_data_1", "hs_analytics_source_data_2",
  "hs_google_click_id", "hs_facebook_click_id",
  // Custom UTM properties many accounts add to their forms.
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hubspotCall<T>(token: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${HUBSPOT}${path}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${token.trim()}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    // Search allows five requests a second per account.
    if (res.status === 429 && attempt < 3) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    if (res.status === 401) throw new Error("HubSpot отклонил ключ (401): проверьте, что вставлен Service Key целиком и он не отозван.");
    if (res.status === 403) throw new Error("HubSpot: у ключа нет доступа к контактам (403). Добавьте ключу право чтения контактов — crm.objects.contacts.read.");
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new Error(`HubSpot ответил ${res.status}${data.message ? `: ${String(data.message).slice(0, 200)}` : ""}`);
    return data;
  }
}

type HsContact = { id: string; properties: Record<string, string | null | undefined> };
type HsSearch = { total?: number; results?: HsContact[]; paging?: { next?: { after?: string } } };

export async function testHubspot(token: string) {
  const data = await hubspotCall<HsSearch>(token, HUBSPOT_SEARCH, { limit: 1, properties: ["email"] });
  return `контактов в аккаунте: ${data.total ?? 0}`;
}

/** Stage names as the account shows them («Customer», «Попытка связаться»); the raw value is kept when they cannot be read. */
async function hubspotLabels(token: string, property: string) {
  const labels = new Map<string, string>();
  try {
    const data = await hubspotCall<{ options?: { label?: string; value?: string }[] }>(token, `/crm/v3/properties/contacts/${property}`);
    for (const o of data.options ?? []) if (o.value) labels.set(o.value, o.label ?? o.value);
  } catch {
    // Labels are a nicety: leads still load with the internal names.
  }
  return labels;
}

const HS_SOURCE: Record<string, string> = {
  DIRECT_TRAFFIC: "direct",
  SOCIAL_MEDIA: "social",
  EMAIL_MARKETING: "email",
  REFERRALS: "referral",
  OFFLINE: "offline",
  OTHER_CAMPAIGNS: "campaign",
  AI_REFERRALS: "ai",
};

/** One HubSpot contact → a lead. Exported for the fixture check. */
export function normalizeHubspotContact(c: HsContact, labels?: { stage?: Map<string, string>; lead?: Map<string, string> }): NormalizedLead {
  const p = c.properties ?? {};
  const stage = str(p.lifecyclestage);
  const leadStatus = str(p.hs_lead_status);
  const stageLabel = labels?.stage?.get(stage) ?? stage;
  const leadLabel = labels?.lead?.get(leadStatus) ?? leadStatus;
  const revenue = Number(str(p.total_revenue) || str(p.recent_deal_amount));

  // The lead status says how the conversation goes; the lifecycle stage says how far the person got.
  const ls = leadStatus.toUpperCase();
  let outcome: NormalizedLead["outcome"] =
    stage.toLowerCase() === "customer" || (Number.isFinite(revenue) && revenue > 0 && str(p.total_revenue) !== "")
      ? "won"
      : ls === "UNQUALIFIED"
        ? "junk"
        : ls === "BAD_TIMING"
          ? "lost"
          : ls === "ATTEMPTED_TO_CONTACT"
            ? "no_answer"
            : ["CONNECTED", "IN_PROGRESS", "OPEN_DEAL"].includes(ls) || ["marketingqualifiedlead", "salesqualifiedlead", "opportunity"].includes(stage.toLowerCase())
              ? "qualified"
              : "new";
  // Custom statuses with their own names («Отказ», «Спам») are read by name.
  if (outcome === "new" && (leadLabel || stageLabel)) outcome = outcomeFrom(`${leadLabel} ${stageLabel}`);

  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) if (str(p[k])) utm[k] = str(p[k]);
  const source = str(p.hs_analytics_source).toUpperCase();
  const d1 = str(p.hs_analytics_source_data_1);
  const d2 = str(p.hs_analytics_source_data_2);
  if (str(p.hs_google_click_id)) utm.gclid = str(p.hs_google_click_id);
  if (str(p.hs_facebook_click_id)) utm.fbclid = str(p.hs_facebook_click_id);
  if (utm.gclid || source === "PAID_SEARCH") utm.ad = "google";
  else if (utm.fbclid || source === "PAID_SOCIAL") utm.ad = "meta";
  if (source) utm.hs_source = source;
  if (!utm.utm_source) {
    if (source === "PAID_SOCIAL" && d1) utm.utm_source = d1;
    else if (HS_SOURCE[source]) utm.utm_source = HS_SOURCE[source];
  }
  // HubSpot keeps the campaign in a different slot for search and for social ads.
  const campaign = utm.utm_campaign || (source === "PAID_SOCIAL" ? d2 : source === "PAID_SEARCH" ? d1 : "");

  const name = [str(p.firstname), str(p.lastname)].filter(Boolean).join(" ");
  return {
    externalId: String(c.id),
    leadAt: toDate(p.createdate),
    name: name || str(p.email),
    phone: str(p.phone) || str(p.mobilephone),
    email: str(p.email),
    status: [leadLabel, stageLabel].filter(Boolean).join(" · "),
    outcome,
    value: Number.isFinite(revenue) && revenue > 0 ? revenue : null,
    campaign,
    utm,
    raw: { id: c.id, lifecyclestage: stage, hs_lead_status: leadStatus, hs_analytics_source: source, deals: str(p.num_associated_deals) },
  } satisfies NormalizedLead;
}

/**
 * Contacts changed since the last sync. A contact is a lead; its lead status and lifecycle stage give the outcome,
 * the revenue of its closed-won deals gives the value.
 */
export async function pullHubspot(token: string, since: Date): Promise<NormalizedLead[]> {
  const [stage, lead] = await Promise.all([hubspotLabels(token, "lifecyclestage"), hubspotLabels(token, "hs_lead_status")]);
  const seen = new Map<string, HsContact>();
  let from = since.getTime();
  // One search returns 10 000 rows at most: past that, continue from the last change time seen.
  for (let round = 0; round < 3; round++) {
    let after: string | undefined;
    let rows = 0;
    let last = from;
    for (let page = 0; page < 50; page++) {
      const data: HsSearch = await hubspotCall<HsSearch>(token, HUBSPOT_SEARCH, {
        filterGroups: [{ filters: [{ propertyName: "lastmodifieddate", operator: "GTE", value: String(from) }] }],
        sorts: [{ propertyName: "lastmodifieddate", direction: "ASCENDING" }],
        properties: HS_PROPS,
        limit: 200,
        ...(after ? { after } : {}),
      });
      for (const c of data.results ?? []) {
        seen.set(c.id, c);
        const m = toDate(c.properties?.lastmodifieddate).getTime();
        if (m > last) last = m;
      }
      rows += data.results?.length ?? 0;
      after = data.paging?.next?.after;
      if (!after) break;
      await sleep(220);
    }
    if (rows < 10_000 || last <= from) break;
    from = last;
  }
  return [...seen.values()].map((c) => normalizeHubspotContact(c, { stage, lead }));
}

export { toDate };
