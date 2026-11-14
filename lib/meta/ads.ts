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
}

/** Campaign × day stats of an ad account for [since, until] (account time zone, as in Ads Manager). */
export async function campaignInsights(accountId: string, since: string, until: string) {
  const first = await metaGet<{ data?: MetaInsightRow[]; paging?: { next?: string } }>(`${actId(accountId)}/insights`, {
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions",
    action_breakdowns: "action_type",
    limit: "500",
  });
  return allPages(first);
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
