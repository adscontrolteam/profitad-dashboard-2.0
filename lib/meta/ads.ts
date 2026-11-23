import "server-only";
import { createHmac } from "node:crypto";

/**
 * Meta Marketing API (read only), as the System User of the agency Business Manager.
 * Env: META_SYSTEM_USER_TOKEN (ads_read on the client ad accounts), optional META_APP_SECRET (adds appsecret_proof),
 * META_API_VERSION (default v24.0).
 */
const VERSION = () => process.env.META_API_VERSION || "v24.0";
const token = () => process.env.META_SYSTEM_USER_TOKEN ?? "";

export const metaConfigured = () => Boolean(token());
export const actId = (accountId: string) => `act_${accountId.replace(/^act_/, "").replace(/\D/g, "")}`;

async function metaGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: token() });
  if (process.env.META_APP_SECRET) query.set("appsecret_proof", createHmac("sha256", process.env.META_APP_SECRET).update(token()).digest("hex"));
  return metaFetch<T>(`https://graph.facebook.com/${VERSION()}/${path}?${query}`);
}

async function metaFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || data.error) {
    const e = data.error;
    if (e?.code === 190) throw new Error("Токен Meta недействителен или отозван (META_SYSTEM_USER_TOKEN).");
    if (e?.code === 200 || e?.code === 10) throw new Error(`Нет доступа к кабинету Meta: ${e.message ?? ""}`.trim());
    throw new Error(e?.message ?? `Meta API: HTTP ${res.status}`);
  }
  return data;
}

/** Follows `paging.next` until the end. */
async function allPages<R>(first: { data?: R[]; paging?: { next?: string } }) {
  const out = [...(first.data ?? [])];
  let next = first.paging?.next;
  while (next) {
    const page = await metaFetch<{ data?: R[]; paging?: { next?: string } }>(next);
    out.push(...(page.data ?? []));
    next = page.paging?.next;
  }
  return out;
}

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaInsightRow {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  /** Added by us from the separate Instagram read; null = Meta does not report it. */
  profile_visits?: number | null;
}

/**
 * Instagram follows and profile visits that Meta attributes to ads — the «Подписки в Instagram» and «Посещения профиля
 * Instagram» columns of Ads Manager (follows are counted from July 2025). Custom metrics of a cabinet (cost per follower,
 * conversion to follower) are formulas over these two and cannot be read through the API: we read the two and divide.
 * They are not `actions` but insights fields of their own, and Meta's reference does not list them, so every name is
 * asked for separately: a refusal only means «no such number», never a failed sync.
 */
export const INSTAGRAM_FOLLOW = "instagram_profile_follow";
const FOLLOW_FIELDS = ["instagram_profile_follow", "instagram_profile_follows"];
const VISIT_FIELDS = ["instagram_profile_visits", "instagram_profile_visit"];
/** Which name the account answered to last time (per server process), so the misses are not repeated on every sync. */
const knownField = new Map<string, string>();
/** What happened on the last read of an account, for the sync message. */
export const instagramAdsNote = new Map<string, string>();

type Extra = string | number | { value?: string | number }[] | undefined;
const extraCount = (v: Extra) => (Array.isArray(v) ? v.reduce((a, x) => a + Number(x.value ?? 0), 0) : Number(v ?? 0)) || 0;
type ExtraRow = { campaign_id?: string; date_start: string } & Record<string, Extra>;

async function extraField(accountId: string, params: Record<string, string>, names: string[]) {
  const first = knownField.get(names[0]);
  let failure = "";
  for (const name of first ? [first, ...names.filter((n) => n !== first)] : names) {
    try {
      const rows = await allPages(
        await metaGet<{ data?: ExtraRow[]; paging?: { next?: string } }>(`${actId(accountId)}/insights`, { ...params, fields: `campaign_id,${name}`, limit: "500" }),
      );
      knownField.set(names[0], name);
      return { name, rows: rows.map((r) => ({ key: `${r.campaign_id ?? ""}:${r.date_start}`, value: extraCount(r[name]) })), failure: "" };
    } catch (error) {
      failure = (error as Error).message;
    }
  }
  return { name: null, rows: [], failure };
}

async function instagramFromAds(accountId: string, params: Record<string, string>) {
  const [follows, visits] = await Promise.all([extraField(accountId, params, FOLLOW_FIELDS), extraField(accountId, params, VISIT_FIELDS)]);
  const total = (x: typeof follows) => x.rows.reduce((a, r) => a + r.value, 0);
  instagramAdsNote.set(
    accountId.replace(/\D/g, ""),
    [
      follows.name ? `подписки Instagram: ${total(follows)}` : `подписки Instagram Meta не отдала (${follows.failure})`,
      visits.name ? `посещения профиля: ${total(visits)}` : `посещения профиля Meta не отдала (${visits.failure})`,
    ].join(", "),
  );
  return { follows: new Map(follows.rows.map((r) => [r.key, r.value])), visits: visits.name ? new Map(visits.rows.map((r) => [r.key, r.value])) : null };
}

/** Campaign × day stats of an ad account for [since, until] (account time zone, as in Ads Manager). */
export async function campaignInsights(accountId: string, since: string, until: string) {
  const window = { level: "campaign", time_increment: "1", time_range: JSON.stringify({ since, until }) };
  const first = await metaGet<{ data?: MetaInsightRow[]; paging?: { next?: string } }>(`${actId(accountId)}/insights`, {
    ...window,
    fields: "campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions",
    action_breakdowns: "action_type",
    limit: "500",
  });
  const rows = await allPages(first);
  const instagram = await instagramFromAds(accountId, window);
  for (const r of rows) {
    const key = `${r.campaign_id}:${r.date_start}`;
    const n = instagram.follows.get(key);
    if (n) r.actions = [...(r.actions ?? []), { action_type: INSTAGRAM_FOLLOW, value: String(n) }];
    r.profile_visits = instagram.visits ? (instagram.visits.get(key) ?? 0) : null;
  }
  return rows;
}

/** Action types the account actually had in the last `days` days, most frequent first — to choose what counts as a result. */
export async function accountActionTypes(accountId: string, days = 30) {
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await allPages(
    await metaGet<{ data?: { actions?: MetaAction[] }[]; paging?: { next?: string } }>(`${actId(accountId)}/insights`, {
      level: "account",
      time_range: JSON.stringify({ since, until }),
      fields: "actions",
    }),
  );
  const total = new Map<string, number>();
  for (const r of rows) for (const a of r.actions ?? []) total.set(a.action_type, (total.get(a.action_type) ?? 0) + Number(a.value || 0));
  const instagram = await instagramFromAds(accountId, { level: "account", time_range: JSON.stringify({ since, until }) });
  const follows = [...instagram.follows.values()].reduce((a, n) => a + n, 0);
  if (follows) total.set(INSTAGRAM_FOLLOW, follows);
  return [...total.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
}

/** Ad accounts the System User can read (for the account picker and the connections page). */
export async function metaAdAccounts() {
  const first = await metaGet<{ data?: { account_id: string; name: string; currency: string; account_status: number }[]; paging?: { next?: string } }>(
    "me/adaccounts",
    { fields: "account_id,name,currency,account_status", limit: "200" },
  );
  return (await allPages(first)).map((a) => ({ id: a.account_id, name: a.name, currency: a.currency, active: a.account_status === 1 }));
}

/** Every row of a list edge, as the System User (follows paging). */
export async function metaList<R>(path: string, params: Record<string, string>) {
  return allPages<R>(await metaGet<{ data?: R[]; paging?: { next?: string } }>(path, params));
}

/** Campaign id → Meta's effective status (ACTIVE, PAUSED, ARCHIVED, WITH_ISSUES…), for the live status column. */
export async function metaCampaignStatuses(accountId: string) {
  const rows = await metaList<{ id: string; effective_status?: string }>(`${actId(accountId)}/campaigns`, { fields: "id,effective_status", limit: "500" });
  return new Map(rows.map((c) => [c.id, c.effective_status ?? ""]));
}

/**
 * Campaign id → reach and frequency over the whole window. Reach is people, not a daily sum, so it cannot be
 * added up from the stored days: Meta has to count it for the exact period.
 */
export async function metaCampaignReach(accountId: string, since: string, until: string) {
  const rows = await metaList<{ campaign_id: string; reach?: string; frequency?: string }>(`${actId(accountId)}/insights`, {
    level: "campaign",
    fields: "campaign_id,reach,frequency",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
  return new Map(rows.map((r) => [r.campaign_id, { reach: Number(r.reach ?? 0), frequency: Number(r.frequency ?? 0) }]));
}

/** People reached by the whole account in the window (for the «Частота» tile). */
export async function metaAccountReach(accountId: string, since: string, until: string) {
  const rows = await metaList<{ reach?: string }>(`${actId(accountId)}/insights`, { level: "account", fields: "reach", time_range: JSON.stringify({ since, until }) });
  return Number(rows[0]?.reach ?? 0);
}
