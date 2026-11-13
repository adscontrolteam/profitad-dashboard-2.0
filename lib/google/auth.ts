import "server-only";
import { createSign } from "node:crypto";

/**
 * Google service account of the dashboard (GOOGLE_SERVICE_ACCOUNT_JSON: the key file contents, raw JSON or base64).
 * Used for Google Ads API, Sheets and Drive. Resources are shared with its email; no user passwords anywhere.
 */
interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export const SCOPES = {
  ads: "https://www.googleapis.com/auth/adwords",
  sheets: "https://www.googleapis.com/auth/spreadsheets",
  drive: "https://www.googleapis.com/auth/drive",
} as const;

let parsed: ServiceAccount | null | undefined;

export function serviceAccount(): ServiceAccount | null {
  if (parsed !== undefined) return parsed;
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (!raw) return (parsed = null);
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as ServiceAccount;
    parsed = sa.client_email && sa.private_key ? sa : null;
  } catch {
    parsed = null;
  }
  return parsed;
}

export const serviceAccountEmail = () => serviceAccount()?.client_email ?? null;

const cache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Workspace user the service account acts as for Drive and Sheets (domain-wide delegation),
 * so files are owned by that user and live in their My Drive. Unset = the service account itself.
 */
export const workspaceUser = () => (process.env.GOOGLE_WORKSPACE_USER ?? "").trim() || null;

export async function googleAccessToken(scopes: string[], subject: string | null = null): Promise<string> {
  const sa = serviceAccount();
  if (!sa) throw new GoogleNotConfigured("Сервис-аккаунт Google не настроен (GOOGLE_SERVICE_ACCOUNT_JSON).");

  const scope = scopes.slice().sort().join(" ");
  const cacheKey = `${subject ?? ""}|${scope}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    ...(subject ? { sub: subject } : {}),
    scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    if (subject && /unauthorized_client|not authorized/i.test(JSON.stringify(body))) {
      throw new GoogleNotConfigured(
        `Делегирование на уровне домена не настроено для ${subject}: Admin Console → Безопасность → Управление API → Делегирование на уровне домена.`,
      );
    }
    throw new Error(`Google не выдал токен: ${body.error_description ?? res.status}`);
  }
  cache.set(cacheKey, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

export class GoogleNotConfigured extends Error {}

/** Fetch to a Google API with the service account token; throws with Google's own message on errors. */
export async function googleFetch<T>(
  url: string,
  scopes: string[],
  init: RequestInit = {},
  opts: { asWorkspaceUser?: boolean } = {},
): Promise<T> {
  const token = await googleAccessToken(scopes, opts.asWorkspaceUser ? workspaceUser() : null);
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new GoogleApiError(res.status, googleErrorMessage(data) ?? `HTTP ${res.status}`, data);
  return data as T;
}

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: unknown,
  ) {
    super(message);
  }
}

function googleErrorMessage(data: unknown): string | null {
  const err = (data as { error?: { message?: string; details?: { errors?: { message?: string }[] }[] } })?.error;
  const adsMessage = err?.details?.[0]?.errors?.[0]?.message;
  return adsMessage ?? err?.message ?? null;
}
