import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, leads, projectIntegrations, salesRecords, type ProjectIntegrationRow } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import type { IntegrationKind } from "./kinds";
import type { IntegrationConfig, IntegrationView, NormalizedLead, NormalizedSale } from "./types";

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

/**
 * A sheet is the source of truth: all its leads are replaced at once, so rows deleted, merged or re-statused
 * in the sheet are reflected exactly. Runs in one transaction — readers never see a half-empty project.
 */
export async function replaceLeads(projectId: string, source: string, items: NormalizedLead[]) {
  const rows = items.map((l) => ({
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
  await getDb().transaction(async (tx) => {
    await tx.delete(leads).where(and(eq(leads.projectId, projectId), eq(leads.source, source)));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(leads).values(rows.slice(i, i + 200)).onConflictDoNothing();
  });
  return rows.length;
}

export async function replaceSales(projectId: string, source: string, items: NormalizedSale[]) {
  await getDb().transaction(async (tx) => {
    await tx.delete(salesRecords).where(and(eq(salesRecords.projectId, projectId), eq(salesRecords.source, source)));
    if (items.length) {
      await tx
        .insert(salesRecords)
        .values(items.map((s) => ({ projectId, source, ...s, updatedAt: new Date() })))
        .onConflictDoNothing();
    }
  });
  return items.length;
}

/** Sales sources other than this one (a re-configured sheet must not leave old rows behind). */
export async function dropOtherSales(projectId: string, keep: string | null) {
  const db = getDb();
  const where = keep ? and(eq(salesRecords.projectId, projectId), sql`${salesRecords.source} <> ${keep}`) : eq(salesRecords.projectId, projectId);
  await db.delete(salesRecords).where(where);
}

/* ---------- Funnel: real leads vs ad cabinet, by month ---------- */

export interface FunnelMonth {
  month: string;
  spend: number | null;
  cabinetLeads: number | null;
  leads: number;
  google: number;
  noAnswer: number;
  junk: number;
  /** Paying clients of the month: everyone who paid in it (lead month when no payment date is filled). */
  clients: number;
  /** Of `clients`: paid in an earlier month too — repeat purchase (retention). */
  clientsRepeat: number;
  /** Of `clients`: first payment, but the lead came in an earlier month. */
  clientsFromEarlier: number;
  salesCount: number;
  revenue: number;
}

/** How long leads take to pay: from the lead's date to its first payment date (all history, not just 6 months). */
export interface PaymentLag {
  /** Paying leads with a payment date filled in. */
  count: number;
  medianDays: number | null;
  avgDays: number | null;
  /** Share of those that paid within 7 / 30 / 60 days. */
  within7: number;
  within30: number;
  within60: number;
}

export interface Funnel {
  hasLeads: boolean;
  lag: PaymentLag;
  hasSales: boolean;
  currency: string;
  months: FunnelMonth[];
}

/**
 * Month by month: ad spend and the leads the ad cabinet counted, next to the leads the client actually got
 * (sheet/CRM), how many never answered, how many paid, and money from the sales records by payment date.
 */
export async function projectFunnel(projectId: string, months = 6): Promise<Funnel> {
  const db = getDb();
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));
  const sinceIso = since.toISOString().slice(0, 10);
  const month = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM')`;

  const [ads, ls, ss] = await Promise.all([
    db
      .select({ month: month(adMetricsDaily.date), spend: sql<number>`sum(${adMetricsDaily.spend})`, leads: sql<number>`sum(${adMetricsDaily.leads})` })
      .from(adMetricsDaily)
      .where(and(eq(adMetricsDaily.projectId, projectId), gte(adMetricsDaily.date, sinceIso)))
      .groupBy(sql`1`),
    db
      .select({
        month: sql<string>`to_char(${leads.leadAt} at time zone 'UTC', 'YYYY-MM')`,
        leads: sql<number>`count(*) filter (where ${leads.outcome} <> 'junk')`,
        google: sql<number>`count(*) filter (where ${leads.outcome} <> 'junk' and ${leads.utm}->>'ad' = 'google')`,
        noAnswer: sql<number>`count(*) filter (where ${leads.outcome} = 'no_answer')`,
        junk: sql<number>`count(*) filter (where ${leads.outcome} = 'junk')`,
      })
      .from(leads)
      .where(and(eq(leads.projectId, projectId), sql`${leads.leadAt} >= ${sinceIso}::date`))
      .groupBy(sql`1`),
    db
      .select({
        month: month(salesRecords.date),
        count: sql<number>`sum(${salesRecords.count})`,
        amount: sql<number>`sum(${salesRecords.amount})`,
        currency: sql<string>`max(${salesRecords.currency})`,
      })
      .from(salesRecords)
      .where(and(eq(salesRecords.projectId, projectId), gte(salesRecords.date, sinceIso)))
      .groupBy(sql`1`),
  ]);

  // Per-lead payments (each «Дата оплати N» + «Сума N» pair) count in the month they were paid — the cash view.
  // A sales sheet, when connected, is the money source instead, so nothing is counted twice.
  const paid = ss.length
    ? []
    : ((
        await db.execute(sql`
          select left(coalesce(nullif(p->>'date', ''), to_char(${leads.leadAt}, 'YYYY-MM-DD')), 7) as month,
                 sum((p->>'amount')::float8) as amount,
                 count(*) as n
          from ${leads}, jsonb_array_elements(coalesce(${leads.raw}->'payments', '[]'::jsonb)) as p
          where ${leads.projectId} = ${projectId} and (p->>'amount')::float8 > 0
          group by 1`)
      ).rows as { month: string; amount: number; n: number }[]);

  // A client counts in every month they paid. «Repeat» = paid before (retention); «earlier» = first payment
  // this month but the lead came in a previous month. Paid without dates → one payment in the lead's month.
  const clients = (
    await db.execute(sql`
      with won as (
        select ${leads.id} as id, to_char(${leads.leadAt}, 'YYYY-MM') as lead_month, ${leads.raw} as raw, ${leads.utm} as utm,
               to_char(${leads.leadAt}, 'YYYY-MM-DD') as lead_day
        from ${leads}
        where ${leads.projectId} = ${projectId} and ${leads.outcome} = 'won'
      ),
      ev as (
        select w.id, w.lead_month, left(p->>'date', 7) as month
        from won w, jsonb_array_elements(coalesce(w.raw->'payments', '[]'::jsonb)) p
        where coalesce(p->>'date', '') <> ''
        union
        select w.id, w.lead_month, left(coalesce(nullif(w.utm->>'paid_at', ''), w.lead_day), 7)
        from won w
        where not exists (
          select 1 from jsonb_array_elements(coalesce(w.raw->'payments', '[]'::jsonb)) p where coalesce(p->>'date', '') <> ''
        )
      ),
      firsts as (select id, min(month) as first_month from ev group by id)
      select ev.month,
             count(distinct ev.id) as n,
             count(distinct ev.id) filter (where f.first_month < ev.month) as repeat,
             count(distinct ev.id) filter (where f.first_month = ev.month and ev.lead_month < ev.month) as earlier
      from ev join firsts f using (id)
      where ev.month >= ${sinceIso.slice(0, 7)}
      group by 1`)
  ).rows as { month: string; n: number; repeat: number; earlier: number }[];

  const [lagRow] = (
    await db.execute(sql`
      with d as (
        select ((select min(p->>'date') from jsonb_array_elements(coalesce(${leads.raw}->'payments', '[]'::jsonb)) p where coalesce(p->>'date', '') <> '')::date
                - (${leads.leadAt} at time zone 'UTC')::date) as days
        from ${leads}
        where ${leads.projectId} = ${projectId} and ${leads.outcome} = 'won'
      )
      select count(*) as n,
             percentile_cont(0.5) within group (order by days) as median,
             avg(days) as avg,
             count(*) filter (where days <= 7) as w7,
             count(*) filter (where days <= 30) as w30,
             count(*) filter (where days <= 60) as w60
      from d where days is not null and days >= 0`)
  ).rows as { n: number; median: number | null; avg: number | null; w7: number; w30: number; w60: number }[];
  const lagN = Number(lagRow?.n ?? 0);
  const lag: PaymentLag = {
    count: lagN,
    medianDays: lagN ? Math.round(Number(lagRow.median)) : null,
    avgDays: lagN ? Math.round(Number(lagRow.avg)) : null,
    within7: lagN ? Number(lagRow.w7) / lagN : 0,
    within30: lagN ? Number(lagRow.w30) / lagN : 0,
    within60: lagN ? Number(lagRow.w60) / lagN : 0,
  };

  const keys: string[] = [];
  for (let d = new Date(since); keys.length < months; d.setUTCMonth(d.getUTCMonth() + 1)) keys.push(d.toISOString().slice(0, 7));
  const pick = <T extends { month: string }>(rows: T[], m: string) => rows.find((r) => r.month === m);

  return {
    hasLeads: ls.length > 0,
    lag,
    hasSales: ss.length > 0 || paid.length > 0,
    currency: ss.find((s) => s.currency)?.currency ?? "",
    months: keys.map((m) => {
      const a = pick(ads, m), l = pick(ls, m), s = pick(ss, m), p = pick(paid, m), c = pick(clients, m);
      return {
        month: m,
        spend: a ? Number(a.spend) : null,
        cabinetLeads: a ? Number(a.leads) : null,
        leads: Number(l?.leads ?? 0),
        google: Number(l?.google ?? 0),
        noAnswer: Number(l?.noAnswer ?? 0),
        junk: Number(l?.junk ?? 0),
        clients: Number(c?.n ?? 0),
        clientsRepeat: Number(c?.repeat ?? 0),
        clientsFromEarlier: Number(c?.earlier ?? 0),
        salesCount: Number(s?.count ?? p?.n ?? 0),
        revenue: Number(s?.amount ?? p?.amount ?? 0),
      };
    }),
  };
}

/** Real totals for a period, used instead of the ad cabinet's counts when the project has a lead source. */
export async function realTotals(projectIds: string[], periods: Map<string, { start: string; end: string }>) {
  if (projectIds.length === 0) return new Map<string, { leads?: number; sales?: number; revenue?: number }>();
  const db = getDb();
  const out = new Map<string, { leads?: number; sales?: number; revenue?: number }>();
  await Promise.all(
    projectIds.map(async (id) => {
      const p = periods.get(id);
      if (!p) return;
      const [[l], [s]] = await Promise.all([
        db
          .select({ n: sql<number>`count(*) filter (where ${leads.outcome} <> 'junk')`, any: sql<number>`count(*)` })
          .from(leads)
          .where(and(eq(leads.projectId, id), sql`(${leads.leadAt} at time zone 'UTC')::date between ${p.start}::date and ${p.end}::date`)),
        db
          .select({ n: sql<number | null>`sum(${salesRecords.count})`, amount: sql<number | null>`sum(${salesRecords.amount})` })
          .from(salesRecords)
          .where(and(eq(salesRecords.projectId, id), gte(salesRecords.date, p.start), lte(salesRecords.date, p.end))),
      ]);
      const entry: { leads?: number; sales?: number; revenue?: number } = {};
      if (await hasLeadSource(id)) entry.leads = Number(l?.n ?? 0);
      if (s?.amount !== null && s?.amount !== undefined) {
        entry.sales = Number(s.n ?? 0);
        entry.revenue = Number(s.amount);
      }
      if (Object.keys(entry).length) out.set(id, entry);
    }),
  );
  return out;
}

async function hasLeadSource(projectId: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), sql`(${projectIntegrations.kind} = 'sheets_leads' or (${projectIntegrations.kind} = 'crm'))`));
  return Number(row?.n ?? 0) > 0;
}
