import { and, asc, desc, eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import {
  finAssignments,
  finBuyerRates,
  finClients,
  finExpenses,
  finInvoices,
  finPaymentMethods,
  finPayouts,
  finPlans,
  finSmmRates,
  finStaff,
  finTerms,
  finTermsMonthly,
  socialConnections,
  type FinExpenseRow,
  type FinInvoiceRow,
  type FinPaymentMethodRow,
  type FinStaffRow,
  type InvoiceItem,
  type InvoiceRecipient,
} from "@/db/schema";
import type { ShareBase, Terms } from "./rules";

/* eslint-disable @typescript-eslint/no-unused-vars -- rest destructuring drops timestamp columns */

/* ---------- terms ---------- */

export async function listTerms(): Promise<Terms[]> {
  const rows = await getDb().select().from(finTerms);
  return rows.map((r) => ({
    projectId: r.projectId,
    fixAmount: r.fixAmount,
    currency: r.currency,
    sharePct: r.sharePct,
    shareBase: (r.shareBase as ShareBase | null) ?? null,
    buyerRate: r.buyerRate,
    payDay: r.payDay,
    startMonth: r.startMonth,
    note: r.note,
  }));
}

export async function saveTerms(t: Terms, actor: string) {
  const values = { ...t, updatedAt: new Date(), updatedBy: actor };
  await getDb().insert(finTerms).values(values).onConflictDoUpdate({ target: finTerms.projectId, set: values });
}

export async function deleteTerms(projectId: string) {
  await getDb().delete(finTerms).where(eq(finTerms.projectId, projectId));
}

/* ---------- payment methods ---------- */

export type PaymentMethod = Omit<FinPaymentMethodRow, "updatedAt">;

export async function listMethods(includeArchived = false): Promise<PaymentMethod[]> {
  const rows = await getDb().select().from(finPaymentMethods).orderBy(asc(finPaymentMethods.position), asc(finPaymentMethods.label));
  return rows.filter((r) => includeArchived || !r.archived).map(({ updatedAt: _u, ...r }) => r);
}

export async function saveMethod(m: Omit<PaymentMethod, "id" | "position" | "archived"> & { id?: string }) {
  const db = getDb();
  if (m.id) {
    await db.update(finPaymentMethods).set({ ...m, id: m.id, updatedAt: new Date() }).where(eq(finPaymentMethods.id, m.id));
    return m.id;
  }
  const [row] = await db.select({ v: max(finPaymentMethods.position) }).from(finPaymentMethods);
  const id = crypto.randomUUID();
  await db.insert(finPaymentMethods).values({ ...m, id, position: (row?.v ?? 0) + 1 });
  return id;
}

export async function archiveMethod(id: string) {
  await getDb().update(finPaymentMethods).set({ archived: true, updatedAt: new Date() }).where(eq(finPaymentMethods.id, id));
}

/* ---------- invoices / payments ---------- */

export type Invoice = Omit<FinInvoiceRow, "createdAt" | "updatedAt"> & { createdAt: string };

const toInvoice = ({ updatedAt: _u, createdAt, ...r }: FinInvoiceRow): Invoice => ({ ...r, createdAt: createdAt.toISOString() });

export async function listInvoices(): Promise<Invoice[]> {
  const rows = await getDb().select().from(finInvoices).orderBy(desc(finInvoices.issueDate), desc(finInvoices.number));
  return rows.map(toInvoice);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const [row] = await getDb().select().from(finInvoices).where(eq(finInvoices.id, id)).limit(1);
  return row ? toInvoice(row) : null;
}

export async function nextInvoiceNumber() {
  const [row] = await getDb().select({ v: max(finInvoices.number) }).from(finInvoices);
  return (row?.v ?? 0) + 1;
}

export interface InvoiceInput {
  projectId: string | null;
  month: string;
  issueDate: string;
  methodId: string | null;
  recipient: InvoiceRecipient | null;
  currency: string;
  items: InvoiceItem[];
  purpose: string;
  payLink: string;
  contractCurrency: string | null;
  fxRate: number | null;
  document: boolean;
  status: "issued" | "paid" | "cancelled";
  paidDate: string | null;
  note: string;
}

export async function saveInvoice(input: InvoiceInput & { id?: string }, actor: string) {
  const db = getDb();
  const total = Math.round(input.items.reduce((a, i) => a + i.amount, 0) * 100) / 100;
  const { id, ...rest } = input;
  if (id) {
    await db.update(finInvoices).set({ ...rest, total, updatedAt: new Date() }).where(eq(finInvoices.id, id));
    return id;
  }
  const newId = crypto.randomUUID();
  await db.insert(finInvoices).values({ ...rest, total, id: newId, number: await nextInvoiceNumber(), createdBy: actor });
  return newId;
}

export async function setInvoiceStatus(id: string, status: "issued" | "paid" | "cancelled", paidDate: string | null) {
  await getDb().update(finInvoices).set({ status, paidDate, updatedAt: new Date() }).where(eq(finInvoices.id, id));
}

export async function deleteInvoice(id: string) {
  await getDb().delete(finInvoices).where(eq(finInvoices.id, id));
}

/* ---------- expenses ---------- */

export type Expense = Omit<FinExpenseRow, "createdAt" | "updatedAt">;

export async function listExpenses(): Promise<Expense[]> {
  const rows = await getDb().select().from(finExpenses).orderBy(asc(finExpenses.category), asc(finExpenses.name));
  return rows.map(({ createdAt: _c, updatedAt: _u, ...r }) => r);
}

export async function saveExpense(e: Omit<Expense, "id"> & { id?: string }) {
  const db = getDb();
  if (e.id) {
    await db.update(finExpenses).set({ ...e, id: e.id, updatedAt: new Date() }).where(eq(finExpenses.id, e.id));
    return;
  }
  await db.insert(finExpenses).values({ ...e, id: crypto.randomUUID() });
}

export async function deleteExpense(id: string) {
  await getDb().delete(finExpenses).where(eq(finExpenses.id, id));
}

/* ---------- staff & payouts ---------- */

export type Staff = Omit<FinStaffRow, "updatedAt">;

export async function listStaff(): Promise<Staff[]> {
  const rows = await getDb().select().from(finStaff).orderBy(asc(finStaff.name));
  return rows.map(({ updatedAt: _u, ...r }) => r);
}

export async function saveStaff(s: Staff) {
  const values = { ...s, updatedAt: new Date() };
  await getDb().insert(finStaff).values(values).onConflictDoUpdate({ target: finStaff.email, set: values });
}

export interface Payout {
  email: string;
  month: string;
  amount: number;
  currency: string;
  paidAt: string;
}

export async function listPayouts(): Promise<Payout[]> {
  const rows = await getDb().select().from(finPayouts);
  return rows.map((r) => ({ email: r.email, month: r.month, amount: r.amount, currency: r.currency, paidAt: r.paidAt.toISOString() }));
}

export async function markPayout(p: { email: string; month: string; amount: number; currency: string; breakdown: unknown }, actor: string) {
  const values = { ...p, paidAt: new Date(), paidBy: actor };
  await getDb().insert(finPayouts).values(values).onConflictDoUpdate({ target: [finPayouts.email, finPayouts.month], set: values });
}

export async function unmarkPayout(email: string, month: string) {
  await getDb().delete(finPayouts).where(and(eq(finPayouts.email, email), eq(finPayouts.month, month)));
}

/* ---------- agency plans ---------- */

export interface AgencyPlan {
  month: string;
  revenuePlan: number | null;
  profitPlan: number | null;
}

export async function listPlans(): Promise<AgencyPlan[]> {
  const rows = await getDb().select().from(finPlans).orderBy(asc(finPlans.month));
  return rows.map((r) => ({ month: r.month, revenuePlan: r.revenuePlan, profitPlan: r.profitPlan }));
}

export async function savePlan(p: AgencyPlan) {
  const values = { ...p, updatedAt: new Date() };
  await getDb().insert(finPlans).values(values).onConflictDoUpdate({ target: finPlans.month, set: values });
}

/* ---------- the day a person started on a project ---------- */

export interface Assignment {
  projectId: string;
  email: string;
  role: string;
  startDate: string;
}

export async function listAssignments(): Promise<Assignment[]> {
  const rows = await getDb().select().from(finAssignments);
  return rows.map((r) => ({ projectId: r.projectId, email: r.email, role: r.role, startDate: r.startDate }));
}

/** null = forget the date: the person counts as on the project from its start. */
export async function saveAssignment(a: Omit<Assignment, "startDate"> & { startDate: string | null }) {
  const db = getDb();
  const key = and(eq(finAssignments.projectId, a.projectId), eq(finAssignments.email, a.email), eq(finAssignments.role, a.role));
  if (a.startDate === null) {
    await db.delete(finAssignments).where(key);
    return;
  }
  const values = { projectId: a.projectId, email: a.email, role: a.role, startDate: a.startDate, updatedAt: new Date() };
  await db
    .insert(finAssignments)
    .values(values)
    .onConflictDoUpdate({ target: [finAssignments.projectId, finAssignments.email, finAssignments.role], set: values });
}

/* ---------- media buyer rates ---------- */

export async function listBuyerRates(): Promise<Map<string, number>> {
  const rows = await getDb().select().from(finBuyerRates);
  return new Map(rows.map((r) => [r.projectId, r.rate]));
}

export async function saveBuyerRate(projectId: string, rate: number | null) {
  const db = getDb();
  if (rate === null) {
    await db.delete(finBuyerRates).where(eq(finBuyerRates.projectId, projectId));
    return;
  }
  const values = { projectId, rate, updatedAt: new Date() };
  await db.insert(finBuyerRates).values(values).onConflictDoUpdate({ target: finBuyerRates.projectId, set: values });
}

/* ---------- SMM rates ---------- */

export async function listSmmRates(): Promise<Map<string, number>> {
  const rows = await getDb().select().from(finSmmRates);
  return new Map(rows.map((r) => [r.projectId, r.rate]));
}

export async function saveSmmRate(projectId: string, rate: number | null) {
  const db = getDb();
  if (rate === null) {
    await db.delete(finSmmRates).where(eq(finSmmRates.projectId, projectId));
    return;
  }
  const values = { projectId, rate, updatedAt: new Date() };
  await db.insert(finSmmRates).values(values).onConflictDoUpdate({ target: finSmmRates.projectId, set: values });
}

/** How many different social networks are connected to each project (Facebook, Instagram, Threads). */
export async function listSocialNetworks(): Promise<Map<string, number>> {
  const rows = await getDb().selectDistinct({ projectId: socialConnections.projectId, network: socialConnections.network }).from(socialConnections);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.projectId, (out.get(r.projectId) ?? 0) + 1);
  return out;
}

/** Amount of an invoice in another currency: through the agreed rate when the invoice has one, else by market rates. */
export function invoiceIn(i: Pick<Invoice, "total" | "currency" | "contractCurrency" | "fxRate">, to: string, convert: (amount: number, from: string, to: string) => number) {
  if (i.contractCurrency && i.fxRate && i.fxRate > 0) return convert(i.total / i.fxRate, i.contractCurrency, to);
  return convert(i.total, i.currency, to);
}

/* ---------- terms of single months ---------- */

export interface MonthTerms {
  projectId: string;
  month: string;
  fixAmount: number | null;
  sharePct: number | null;
  note: string;
}

export async function listMonthTerms(): Promise<MonthTerms[]> {
  const rows = await getDb().select().from(finTermsMonthly);
  return rows.map((r) => ({ projectId: r.projectId, month: r.month, fixAmount: r.fixAmount, sharePct: r.sharePct, note: r.note }));
}

/** Saves the months given; a month with nothing set goes back to the usual terms. */
export async function saveMonthTerms(projectId: string, months: Omit<MonthTerms, "projectId">[]) {
  const db = getDb();
  for (const m of months) {
    if (m.fixAmount === null && m.sharePct === null && !m.note) {
      await db.delete(finTermsMonthly).where(and(eq(finTermsMonthly.projectId, projectId), eq(finTermsMonthly.month, m.month)));
      continue;
    }
    const values = { projectId, ...m, updatedAt: new Date() };
    await db.insert(finTermsMonthly).values(values).onConflictDoUpdate({ target: [finTermsMonthly.projectId, finTermsMonthly.month], set: values });
  }
}

/* ---------- client company details ---------- */

export async function listCompanies(): Promise<Map<string, string>> {
  const rows = await getDb().select().from(finClients);
  return new Map(rows.map((r) => [r.projectId, r.company]));
}

export async function saveCompany(projectId: string, company: string) {
  const values = { projectId, company, updatedAt: new Date() };
  await getDb().insert(finClients).values(values).onConflictDoUpdate({ target: finClients.projectId, set: values });
}
