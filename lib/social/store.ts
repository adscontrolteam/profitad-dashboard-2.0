import "server-only";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, socialConnectLinks, socialConnections, type SocialConnectionRow } from "@/db/schema";
import { decrypt, encrypt, randomToken } from "@/lib/crypto";

export type ConnectedNetwork = SocialConnectionRow["network"];

/** What pages may show: never the token. */
export interface SocialAccountView {
  network: ConnectedNetwork;
  externalId: string;
  name: string;
  pictureUrl: string | null;
  status: "ok" | "error";
  lastError: string | null;
  connectedAt: string;
  expiresAt: string | null;
}

const toView = (r: SocialConnectionRow): SocialAccountView => ({
  network: r.network,
  externalId: r.externalId,
  name: r.name,
  pictureUrl: r.pictureUrl,
  status: r.status === "error" ? "error" : "ok",
  lastError: r.lastError,
  connectedAt: r.connectedAt.toISOString(),
  expiresAt: r.expiresAt?.toISOString() ?? null,
});

export async function listSocialAccounts(projectId: string) {
  const rows = await getDb().select().from(socialConnections).where(eq(socialConnections.projectId, projectId));
  return rows.map(toView).sort((a, b) => a.network.localeCompare(b.network) || a.name.localeCompare(b.name));
}

export interface NewConnection {
  network: ConnectedNetwork;
  externalId: string;
  name: string;
  pictureUrl?: string | null;
  token: string;
  expiresAt?: Date | null;
}

/** Connecting the same account again replaces its token. */
export async function saveConnections(projectId: string, items: NewConnection[]) {
  for (const c of items) {
    const values = {
      projectId,
      network: c.network,
      externalId: c.externalId,
      name: c.name.slice(0, 200),
      pictureUrl: c.pictureUrl ?? null,
      token: encrypt(c.token),
      expiresAt: c.expiresAt ?? null,
      status: "ok",
      lastError: null,
      updatedAt: new Date(),
    };
    await getDb()
      .insert(socialConnections)
      .values(values)
      .onConflictDoUpdate({ target: [socialConnections.projectId, socialConnections.network, socialConnections.externalId], set: values });
  }
}

export async function removeConnection(projectId: string, network: ConnectedNetwork, externalId: string) {
  await getDb()
    .delete(socialConnections)
    .where(and(eq(socialConnections.projectId, projectId), eq(socialConnections.network, network), eq(socialConnections.externalId, externalId)));
}

/** Server-side only: the decrypted token of an account, for API calls. */
export async function connectionToken(projectId: string, network: ConnectedNetwork, externalId: string) {
  const [row] = await getDb()
    .select({ token: socialConnections.token })
    .from(socialConnections)
    .where(and(eq(socialConnections.projectId, projectId), eq(socialConnections.network, network), eq(socialConnections.externalId, externalId)))
    .limit(1);
  return row ? decrypt(row.token) : null;
}

export async function getConnectLink(projectId: string) {
  const [row] = await getDb().select().from(socialConnectLinks).where(eq(socialConnectLinks.projectId, projectId)).limit(1);
  return row ?? null;
}

/** The project's link, created on first use. */
export async function ensureConnectLink(projectId: string) {
  const existing = await getConnectLink(projectId);
  if (existing) return existing;
  await getDb().insert(socialConnectLinks).values({ projectId, token: randomToken() }).onConflictDoNothing();
  return (await getConnectLink(projectId))!;
}

/** New link; the old one stops working. Connected accounts stay. */
export async function rotateConnectLink(projectId: string) {
  const token = randomToken();
  await getDb()
    .insert(socialConnectLinks)
    .values({ projectId, token })
    .onConflictDoUpdate({ target: socialConnectLinks.projectId, set: { token, seenAt: null, createdAt: new Date() } });
  return token;
}

export const isLinkToken = (token: string) => /^[A-Za-z0-9_-]{20,64}$/.test(token);

/** For the public page and the OAuth routes. Null = wrong or revoked link. */
export async function projectByConnectToken(token: string) {
  if (!isLinkToken(token)) return null;
  const [row] = await getDb()
    .select({ projectId: projects.id, name: projects.name })
    .from(socialConnectLinks)
    .innerJoin(projects, eq(projects.id, socialConnectLinks.projectId))
    .where(eq(socialConnectLinks.token, token))
    .limit(1);
  return row ?? null;
}

export async function touchConnectLink(projectId: string) {
  await getDb().update(socialConnectLinks).set({ seenAt: new Date() }).where(eq(socialConnectLinks.projectId, projectId));
}

/** Tokens with an expiry date that ends before `before` — for the daily refresh. */
export async function expiringConnections(before: Date) {
  return getDb()
    .select()
    .from(socialConnections)
    .where(and(isNotNull(socialConnections.expiresAt), lt(socialConnections.expiresAt, before)));
}

export async function markConnection(row: Pick<SocialConnectionRow, "projectId" | "network" | "externalId">, patch: { token?: string; expiresAt?: Date; error?: string | null }) {
  await getDb()
    .update(socialConnections)
    .set({
      ...(patch.token ? { token: encrypt(patch.token) } : {}),
      ...(patch.expiresAt ? { expiresAt: patch.expiresAt } : {}),
      status: patch.error ? "error" : "ok",
      lastError: patch.error ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialConnections.projectId, row.projectId), eq(socialConnections.network, row.network), eq(socialConnections.externalId, row.externalId)));
}
