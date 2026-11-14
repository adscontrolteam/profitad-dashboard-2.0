import "server-only";
import { createHmac } from "node:crypto";
import { googleFetch, GoogleApiError, SCOPES } from "@/lib/google/auth";
import { gaql, mccId } from "@/lib/google/ads";

/**
 * Grant / revoke calls per service. Each grant returns:
 * - { ref } — access given by the dashboard, `ref` is what revoke needs;
 * - { existing: true } — the person already had access: the dashboard will never take it away.
 */
export type GrantResult = { ref: string; existing?: false } | { existing: true; ref?: undefined };

const AS_USER = { asWorkspaceUser: true };
const digits = (v: string) => v.replace(/\D/g, "");
const already = (e: unknown) => e instanceof GoogleApiError && (e.status === 409 || /already|exists|уже/i.test(e.message));

/* ---------- Drive folder ---------- */

export async function grantDrive(folderId: string, email: string): Promise<GrantResult> {
  const list = await googleFetch<{ permissions?: { id: string; emailAddress?: string }[] }>(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true&fields=permissions(id,emailAddress)`,
    [SCOPES.drive],
    {},
    AS_USER,
  );
  if ((list.permissions ?? []).some((p) => p.emailAddress?.toLowerCase() === email)) return { existing: true };
  const r = await googleFetch<{ id: string }>(
    `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true&sendNotificationEmail=true`,
    [SCOPES.drive],
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }) },
    AS_USER,
  );
  return { ref: r.id };
}

export async function revokeDrive(folderId: string, ref: string) {
  await googleFetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions/${ref}?supportsAllDrives=true`, [SCOPES.drive], { method: "DELETE" }, AS_USER).catch(
    (e) => {
      if (!(e instanceof GoogleApiError && e.status === 404)) throw e;
    },
  );
}

/* ---------- Google Ads (through the agency MCC) ---------- */

const adsUrl = (path: string) => `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || "v25"}/${path}`;
const adsHeaders = () => ({
  "content-type": "application/json",
  "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
  "login-customer-id": mccId(),
});

async function adsUsers(cid: string) {
  const rows = await gaql(cid, "SELECT customer_user_access.user_id, customer_user_access.email_address FROM customer_user_access");
  return rows.map((r) => r.customerUserAccess as { userId?: string; emailAddress?: string });
}

export async function grantGoogleAds(customerId: string, email: string): Promise<GrantResult> {
  const cid = digits(customerId);
  // Access through the agency MCC counts as «already has it», as does direct access to the client account.
  const has = async (id: string) => (await adsUsers(id)).some((u) => u.emailAddress?.toLowerCase() === email);
  if ((await has(mccId()).catch(() => false)) || (await has(cid))) return { existing: true };
  const r = await googleFetch<{ result?: { resourceName?: string } }>(adsUrl(`customers/${cid}/customerUserAccessInvitations:mutate`), [SCOPES.ads], {
    method: "POST",
    headers: adsHeaders(),
    body: JSON.stringify({ operation: { create: { emailAddress: email, accessRole: "STANDARD" } } }),
  });
  return { ref: r.result?.resourceName ?? `invitation:${email}` };
}

export async function revokeGoogleAds(customerId: string, email: string, ref: string) {
  const cid = digits(customerId);
  // Accepted → remove the user; still pending → cancel the invitation.
  const user = (await adsUsers(cid)).find((u) => u.emailAddress?.toLowerCase() === email);
  if (user?.userId) {
    await googleFetch(adsUrl(`customers/${cid}/customerUserAccesses:mutate`), [SCOPES.ads], {
      method: "POST",
      headers: adsHeaders(),
      body: JSON.stringify({ operation: { remove: `customers/${cid}/customerUserAccesses/${user.userId}` } }),
    });
  }
  if (ref.startsWith("customers/")) {
    await googleFetch(adsUrl(`customers/${cid}/customerUserAccessInvitations:mutate`), [SCOPES.ads], {
      method: "POST",
      headers: adsHeaders(),
      body: JSON.stringify({ operation: { remove: ref } }),
    }).catch(() => undefined); // already accepted or expired
  }
}

/* ---------- GA4 ---------- */

const GA = "https://analyticsadmin.googleapis.com/v1alpha";

export async function grantGa4(propertyId: string, email: string, role: "editor" | "viewer"): Promise<GrantResult> {
  try {
    const r = await googleFetch<{ name: string }>(
      `${GA}/properties/${propertyId}/accessBindings`,
      [SCOPES.analyticsUsers],
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: email, roles: [`predefinedRoles/${role}`] }) },
      AS_USER,
    );
    return { ref: r.name };
  } catch (e) {
    if (already(e)) return { existing: true };
    throw e;
  }
}

export async function revokeGa4(ref: string) {
  await googleFetch(`${GA}/${ref}`, [SCOPES.analyticsUsers], { method: "DELETE" }, AS_USER).catch((e) => {
    if (!(e instanceof GoogleApiError && e.status === 404)) throw e;
  });
}

/* ---------- Google Tag Manager ---------- */

const GTM = "https://tagmanager.googleapis.com/tagmanager/v2";

export async function grantGtm(accountId: string, containerId: string, email: string, permission: "publish" | "read"): Promise<GrantResult> {
  const list = await googleFetch<{ userPermission?: { path: string; emailAddress: string }[] }>(
    `${GTM}/accounts/${accountId}/user_permissions`,
    [SCOPES.tagmanagerUsers],
    {},
    AS_USER,
  );
  if ((list.userPermission ?? []).some((u) => u.emailAddress.toLowerCase() === email)) return { existing: true };
  const r = await googleFetch<{ path: string }>(
    `${GTM}/accounts/${accountId}/user_permissions`,
    [SCOPES.tagmanagerUsers],
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailAddress: email, accountAccess: { permission: "user" }, containerAccess: [{ containerId, permission }] }),
    },
    AS_USER,
  );
  return { ref: r.path };
}

export async function revokeGtm(ref: string) {
  await googleFetch(`${GTM}/${ref}`, [SCOPES.tagmanagerUsers], { method: "DELETE" }, AS_USER).catch((e) => {
    if (!(e instanceof GoogleApiError && e.status === 404)) throw e;
  });
}

/* ---------- Meta ad account (people of our Business Manager) ---------- */

const META = () => `https://graph.facebook.com/${process.env.META_API_VERSION || "v24.0"}`;
const metaToken = () => process.env.META_SYSTEM_USER_TOKEN ?? "";
export const metaAccessConfigured = () => Boolean(metaToken() && process.env.META_BUSINESS_ID);

async function meta<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, access_token: metaToken() });
  if (process.env.META_APP_SECRET) q.set("appsecret_proof", createHmac("sha256", process.env.META_APP_SECRET).update(metaToken()).digest("hex"));
  const res = await fetch(`${META()}/${path}?${q}`, { method, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(`Meta: ${data.error?.message ?? res.status}`);
  return data;
}

async function businessUserId(email: string) {
  const r = await meta<{ data?: { id: string; email?: string }[] }>("GET", `${process.env.META_BUSINESS_ID}/business_users`, { fields: "id,email", limit: "500" });
  const u = (r.data ?? []).find((x) => x.email?.toLowerCase() === email);
  if (!u) throw new Error(`${email} нет в нашем Business Manager — пригласите: Настройки компании → Пользователи → Люди → Добавить.`);
  return u.id;
}

export async function grantMeta(adAccountId: string, email: string, tasks: string[]): Promise<GrantResult> {
  const user = await businessUserId(email);
  const assigned = await meta<{ data?: { id: string }[] }>("GET", `act_${digits(adAccountId)}/assigned_users`, {
    business: process.env.META_BUSINESS_ID ?? "",
    fields: "id",
    limit: "500",
  });
  if ((assigned.data ?? []).some((u) => u.id === user)) return { existing: true };
  await meta("POST", `act_${digits(adAccountId)}/assigned_users`, { user, tasks: JSON.stringify(tasks), business: process.env.META_BUSINESS_ID ?? "" });
  return { ref: user };
}

export async function revokeMeta(adAccountId: string, ref: string) {
  await meta("DELETE", `act_${digits(adAccountId)}/assigned_users`, { user: ref, business: process.env.META_BUSINESS_ID ?? "" });
}
