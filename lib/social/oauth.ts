import "server-only";
import { createHmac } from "node:crypto";
import { decrypt, safeEqual } from "@/lib/crypto";
import { appUrl } from "@/lib/log/notify";
import { expiringConnections, markConnection, type NewConnection } from "./store";

/**
 * OAuth of the client's social accounts, through our own Meta app.
 *  - «meta»: Facebook Login → the client's Pages and the Instagram professional accounts linked to them.
 *    Env: META_APP_ID, META_APP_SECRET.
 *  - «threads»: Threads Login (a separate app id inside the same Meta app). Env: THREADS_APP_ID, THREADS_APP_SECRET.
 * Redirect URIs to whitelist in the app: <APP_URL>/api/connect/meta/callback and <APP_URL>/api/connect/threads/callback.
 */
export const PROVIDERS = ["meta", "threads"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: unknown): v is Provider => PROVIDERS.includes(v as Provider);

const GRAPH = () => `https://graph.facebook.com/${process.env.META_API_VERSION || "v24.0"}`;
const THREADS_GRAPH = () => (process.env.THREADS_GRAPH_URL || "https://graph.threads.com").replace(/\/$/, "");

const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "business_management",
];
const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

const creds = (p: Provider) =>
  p === "meta"
    ? { id: process.env.META_APP_ID ?? "", secret: process.env.META_APP_SECRET ?? "" }
    : { id: process.env.THREADS_APP_ID ?? "", secret: process.env.THREADS_APP_SECRET ?? "" };

export const providerConfigured = (p: Provider) => Boolean(creds(p).id && creds(p).secret);
export const redirectUri = (p: Provider) => `${appUrl()}/api/connect/${p}/callback`;

export function authorizeUrl(p: Provider, state: string) {
  const { id } = creds(p);
  if (p === "meta") {
    const q = new URLSearchParams({ client_id: id, redirect_uri: redirectUri(p), state, response_type: "code", scope: META_SCOPES.join(",") });
    return `https://www.facebook.com/${process.env.META_API_VERSION || "v24.0"}/dialog/oauth?${q}`;
  }
  const q = new URLSearchParams({ client_id: id, redirect_uri: redirectUri(p), state, response_type: "code", scope: THREADS_SCOPES.join(",") });
  return `https://threads.com/oauth/authorize?${q}`;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string; error_message?: string };
  if (!res.ok || data.error) {
    const message = typeof data.error === "string" ? data.error_message || data.error : data.error?.message;
    throw new Error(message || `HTTP ${res.status}`);
  }
  return data;
}

const inSeconds = (s: number | undefined) => (s ? new Date(Date.now() + s * 1000) : null);

/** Facebook Login: code → long-lived user token → Pages (their tokens do not expire) and linked Instagram accounts. */
async function connectMeta(code: string): Promise<NewConnection[]> {
  const { id, secret } = creds("meta");
  const short = await call<{ access_token: string }>(
    `${GRAPH()}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri("meta"), code })}`,
  );
  const long = await call<{ access_token: string }>(
    `${GRAPH()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`,
  );
  interface Page {
    id: string;
    name: string;
    access_token?: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
  }
  const out: NewConnection[] = [];
  let url: string | undefined = `${GRAPH()}/me/accounts?${new URLSearchParams({
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
    limit: "100",
    access_token: long.access_token,
    appsecret_proof: createHmac("sha256", secret).update(long.access_token).digest("hex"),
  })}`;
  while (url) {
    const page: { data?: Page[]; paging?: { next?: string } } = await call(url);
    for (const p of page.data ?? []) {
      if (!p.access_token) continue;
      out.push({ network: "facebook", externalId: p.id, name: p.name, pictureUrl: p.picture?.data?.url, token: p.access_token });
      const ig = p.instagram_business_account;
      // Instagram is reached with the token of the Page it is linked to.
      if (ig) out.push({ network: "instagram", externalId: ig.id, name: ig.username ? `@${ig.username}` : p.name, pictureUrl: ig.profile_picture_url, token: p.access_token });
    }
    url = page.paging?.next;
  }
  return out;
}

/** Threads Login: code → short-lived → long-lived token (60 days) → profile. */
async function connectThreads(code: string): Promise<NewConnection[]> {
  const { id, secret } = creds("threads");
  const short = await call<{ access_token: string; user_id: string | number }>(`${THREADS_GRAPH()}/oauth/access_token`, {
    method: "POST",
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri("threads"), code }),
  });
  const long = await call<{ access_token: string; expires_in?: number }>(
    `${THREADS_GRAPH()}/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: secret, access_token: short.access_token })}`,
  );
  const me = await call<{ id: string; username?: string; name?: string; threads_profile_picture_url?: string }>(
    `${THREADS_GRAPH()}/v1.0/me?${new URLSearchParams({ fields: "id,username,name,threads_profile_picture_url", access_token: long.access_token })}`,
  );
  return [
    {
      network: "threads",
      externalId: me.id || String(short.user_id),
      name: me.username ? `@${me.username}` : me.name || "Threads",
      pictureUrl: me.threads_profile_picture_url,
      token: long.access_token,
      expiresAt: inSeconds(long.expires_in ?? 60 * 86_400),
    },
  ];
}

export const exchangeCode = (p: Provider, code: string) => (p === "meta" ? connectMeta(code) : connectThreads(code));

/** Daily: Threads tokens that end within 20 days get another 60. A failed refresh marks the account so we ask the client to reconnect. */
export async function refreshSocialTokens() {
  const results: { projectId: string; kind: string; ok: boolean; message: string }[] = [];
  for (const row of await expiringConnections(new Date(Date.now() + 20 * 86_400_000))) {
    if (row.network !== "threads") continue;
    try {
      const fresh = await call<{ access_token: string; expires_in?: number }>(
        `${THREADS_GRAPH()}/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: decrypt(row.token) })}`,
      );
      await markConnection(row, { token: fresh.access_token, expiresAt: inSeconds(fresh.expires_in ?? 60 * 86_400)!, error: null });
      results.push({ projectId: row.projectId, kind: "threads", ok: true, message: `Токен Threads ${row.name} продлён` });
    } catch (error) {
      const message = `Не удалось продлить доступ к Threads ${row.name}: ${(error as Error).message}. Попросите клиента подключить заново по ссылке.`;
      await markConnection(row, { error: message });
      results.push({ projectId: row.projectId, kind: "threads", ok: false, message });
    }
  }
  return results;
}

/**
 * Threads calls our uninstall and delete URLs with a form field `signed_request` = `<signature>.<payload>` (both base64url);
 * the signature is HMAC-SHA256 of the payload text with the Threads app secret. Returns the user id, or null when it is not from Threads.
 */
export function threadsSignedUserId(signedRequest: string): string | null {
  const { secret } = creds("threads");
  const [signature, payload] = signedRequest.split(".");
  if (!secret || !signature || !payload) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(expected, signature.replace(/=+$/, ""))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string | number };
    return data.user_id ? String(data.user_id) : null;
  } catch {
    return null;
  }
}
