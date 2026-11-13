import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { leads, projectIntegrations, type ProjectIntegrationRow } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import type { IntegrationKind } from "./kinds";
import type { IntegrationConfig, IntegrationView, NormalizedLead } from "./types";

export type IntegrationRecord<K extends IntegrationKind = IntegrationKind> = Omit<ProjectIntegrationRow, "config" | "kind"> & {
  kind: K;
  config: IntegrationConfig[K];
};

export async function getIntegration<K extends IntegrationKind>(projectId: string, kind: K) {
  const [row] = await getDb()
    .select()
    .from(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.kind, kind)))
    .limit(1);
  return (row as unknown as IntegrationRecord<K> | undefined) ?? null;
}

export async function listIntegrations(projectId?: string) {
  const db = getDb();
  const rows = projectId
    ? await db.select().from(projectIntegrations).where(eq(projectIntegrations.projectId, projectId))
    : await db.select().from(projectIntegrations);
  return rows as unknown as IntegrationRecord[];
}

export const toView = (r: IntegrationRecord): IntegrationView => ({
  kind: r.kind,
  config: r.config,
  hasSecret: Boolean(r.secret),
  status: (r.status as IntegrationView["status"]) ?? "pending",
  lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
  lastError: r.lastError,
});

export async function saveIntegration<K extends IntegrationKind>(
  projectId: string,
  kind: K,
  config: IntegrationConfig[K],
  secret: string | null | undefined,
  actorEmail: string,
) {
  const values = {
    projectId,
    kind,
    config: config as unknown as Record<string, unknown>,
    // undefined = keep the stored secret, null = remove it
    ...(secret === undefined ? {} : { secret: secret ? encrypt(secret) : null }),
    status: "pending",
    lastError: null,
    updatedAt: new Date(),
    updatedBy: actorEmail,
  };
  await getDb()
    .insert(projectIntegrations)
    .values(values)
    .onConflictDoUpdate({ target: [projectIntegrations.projectId, projectIntegrations.kind], set: values });
}

export async function deleteIntegration(projectId: string, kind: IntegrationKind) {
  await getDb()
    .delete(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.kind, kind)));
}

export async function markIntegration(projectId: string, kind: IntegrationKind, error: string | null) {
  await getDb()
    .update(projectIntegrations)
    .set(error ? { status: "error", lastError: error.slice(0, 500) } : { status: "ok", lastError: null, lastSyncAt: new Date() })
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.kind, kind)));
}

export const readSecret = (r: { secret: string | null }) => (r.secret ? decrypt(r.secret) : null);

/* ---------- Leads ---------- */

export async function upsertLeads(projectId: string, source: string, items: NormalizedLead[]) {
  if (items.length === 0) return 0;
  const db = getDb();
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200).map((l) => ({
      id: crypto.randomUUID(),
      projectId,
      source,
      externalId: l.externalId,
      leadAt: l.leadAt,
      name: l.name.slice(0, 200),
      phone: l.phone.slice(0, 60),
      email: l.email.slice(0, 200),
      status: l.status.slice(0, 120),
      outcome: l.outcome,
      value: l.value,
      campaign: l.campaign.slice(0, 200),
      utm: l.utm,
      raw: l.raw ?? null,
      updatedAt: new Date(),
    }));
    await db
      .insert(leads)
      .values(chunk)
      .onConflictDoUpdate({
        target: [leads.projectId, leads.source, leads.externalId],
        set: {
          name: sql`excluded.name`,
          phone: sql`excluded.phone`,
          email: sql`excluded.email`,
          status: sql`excluded.status`,
          outcome: sql`excluded.outcome`,
          value: sql`excluded.value`,
          campaign: sql`excluded.campaign`,
          utm: sql`excluded.utm`,
          raw: sql`excluded.raw`,
          updatedAt: sql`now()`,
        },
      });
  }
  return items.length;
}

export async function recentLeads(projectId: string, limit = 50) {
  return getDb().select().from(leads).where(eq(leads.projectId, projectId)).orderBy(desc(leads.leadAt)).limit(limit);
}

/** Leads per day (YYYY-MM-DD in UTC) since the date, for the daily report. */
export async function leadsPerDay(projectId: string, since: string) {
  const rows = await getDb()
    .select({ day: sql<string>`to_char(${leads.leadAt} at time zone 'UTC', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.projectId, projectId), sql`${leads.leadAt} >= ${since}::date`))
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [r.day, Number(r.n)]));
}
