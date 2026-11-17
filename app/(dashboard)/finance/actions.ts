"use server";

import { refresh } from "next/cache";
import { requireSection } from "@/lib/access/viewer";
import type { InvoiceItem, InvoiceRecipient } from "@/db/schema";
import { CURRENCIES } from "@/lib/finance/currency";
import { EN_FIELDS } from "@/lib/finance/methods";
import { SHARE_BASES, type ShareBase } from "@/lib/finance/rules";
import {
  archiveMethod,
  saveBuyerRate,
  saveCompany,
  saveMonthTerms,
  deleteExpense,
  deleteInvoice,
  markPayout,
  saveExpense,
  saveInvoice,
  saveMethod,
  savePlan,
  saveStaff,
  saveTerms,
  setInvoiceStatus,
  unmarkPayout,
} from "@/lib/finance/store";

export interface FinState {
  ok: boolean;
  message: string | null;
  id?: string;
}

const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (f: FormData, key: string, max = 500) => String(f.get(key) ?? "").trim().slice(0, max);

function num(f: FormData, key: string): number | null | "bad" {
  const raw = text(f, key, 30).replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : "bad";
}

const currencyOf = (f: FormData, key = "currency") => {
  const c = text(f, key, 8).toUpperCase();
  return (CURRENCIES as readonly string[]).includes(c) ? c : null;
};

const guard = () => requireSection("finance");

/* ---------------- client terms ---------------- */

export async function saveTermsAction(_prev: FinState, f: FormData): Promise<FinState> {
  const viewer = await guard();
  const projectId = text(f, "projectId", 80);
  const fix = num(f, "fixAmount");
  const pct = num(f, "sharePct");
  const payDay = num(f, "payDay");
  const currency = currencyOf(f);
  const startMonth = text(f, "startMonth", 7);
  const base = text(f, "shareBase", 30);
  if (!projectId) return { ok: false, message: "Нет проекта." };
  if (fix === "bad" || pct === "bad" || payDay === "bad") return { ok: false, message: "Суммы должны быть числами." };
  if (!currency) return { ok: false, message: "Выберите валюту." };
  if (!MONTH.test(startMonth)) return { ok: false, message: "Укажите, с какого месяца действуют условия." };
  const shareBase = SHARE_BASES.some((b) => b.value === base) ? (base as ShareBase) : null;
  if (pct && !shareBase) return { ok: false, message: "Выберите, от чего считается %." };
  await saveTerms(
    {
      projectId,
      fixAmount: fix ?? 0,
      currency,
      sharePct: pct || null,
      shareBase: pct ? shareBase : null,
      buyerRate: null,
      payDay: payDay === null ? null : Math.min(31, Math.max(1, Math.round(payDay))),
      startMonth,
      note: text(f, "note", 2000),
    },
    viewer.email,
  );
  refresh();
  return { ok: true, message: "Условия сохранены." };
}

/* ---------------- payment methods ---------------- */

const DETAIL_KEYS = ["recipient", "iban", "taxId", "bank", "mfo", "bankCode", "card", "network", "wallet", "url", ...EN_FIELDS.map((f) => f.key)];

export async function saveMethodAction(_prev: FinState, f: FormData): Promise<FinState> {
  await guard();
  const label = text(f, "label", 80);
  const kind = text(f, "kind", 10);
  const currency = currencyOf(f);
  if (!label) return { ok: false, message: "Укажите название." };
  if (!["fop", "card", "crypto", "link"].includes(kind)) return { ok: false, message: "Выберите тип." };
  if (!currency) return { ok: false, message: "Выберите валюту." };
  const details: Record<string, string> = {};
  for (const k of DETAIL_KEYS) {
    const v = text(f, `d_${k}`, 600);
    if (v) details[k] = v;
  }
  await saveMethod({
    id: text(f, "id", 64) || undefined,
    label,
    kind: kind as "fop" | "card" | "crypto" | "link",
    details,
    currency,
    serviceName: text(f, "serviceName", 200),
    purpose: text(f, "purpose", 300),
  });
  refresh();
  return { ok: true, message: "Реквизиты сохранены." };
}

export async function archiveMethodAction(id: string) {
  await guard();
  await archiveMethod(id);
  refresh();
}

/* ---------------- invoices ---------------- */

export interface InvoicePayload {
  id?: string;
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
  status: "issued" | "paid";
  paidDate: string | null;
  note: string;
}

export async function saveInvoiceAction(p: InvoicePayload): Promise<FinState> {
  const viewer = await guard();
  if (!MONTH.test(p.month)) return { ok: false, message: "Укажите месяц, за который оплата." };
  if (!DATE.test(p.issueDate)) return { ok: false, message: "Укажите дату." };
  if (!(CURRENCIES as readonly string[]).includes(p.currency)) return { ok: false, message: "Выберите валюту." };
  const items = p.items
    .map((i) => ({ name: String(i.name).trim().slice(0, 300), qty: Number(i.qty) || 1, amount: Math.round(Number(i.amount) * 100) / 100 }))
    .filter((i) => i.name && Number.isFinite(i.amount) && i.amount > 0);
  if (!items.length) return { ok: false, message: "Добавьте услугу и сумму." };
  if (p.status === "paid" && (!p.paidDate || !DATE.test(p.paidDate))) return { ok: false, message: "Укажите дату оплаты." };
  // The agreed rate is kept only when the invoice is in another currency than the client's terms.
  const fx =
    p.contractCurrency && p.contractCurrency !== p.currency && (CURRENCIES as readonly string[]).includes(p.contractCurrency) && p.fxRate && Number.isFinite(p.fxRate) && p.fxRate > 0;
  if (p.contractCurrency && p.contractCurrency !== p.currency && !fx) return { ok: false, message: "Укажите курс." };
  const id = await saveInvoice(
    {
      id: p.id || undefined,
      projectId: p.projectId || null,
      month: p.month,
      issueDate: p.issueDate,
      methodId: p.methodId,
      recipient: p.recipient,
      currency: p.currency,
      items,
      purpose: p.purpose.slice(0, 500),
      payLink: p.payLink.slice(0, 1000),
      contractCurrency: fx ? p.contractCurrency : null,
      fxRate: fx ? p.fxRate : null,
      document: p.document,
      status: p.status,
      paidDate: p.status === "paid" ? p.paidDate : null,
      note: p.note.slice(0, 2000),
    },
    viewer.email,
  );
  // «BILL TO» typed in the invoice becomes the client's company details for the next invoices.
  if (p.projectId && p.recipient?.intl?.billTo.trim()) await saveCompany(p.projectId, p.recipient.intl.billTo.trim().slice(0, 2000));
  refresh();
  return { ok: true, message: "Сохранено.", id };
}

export async function setInvoiceStatusAction(id: string, status: "issued" | "paid" | "cancelled", paidDate?: string) {
  await guard();
  await setInvoiceStatus(id, status, status === "paid" ? (paidDate && DATE.test(paidDate) ? paidDate : new Date().toISOString().slice(0, 10)) : null);
  refresh();
}

export async function deleteInvoiceAction(id: string) {
  await guard();
  await deleteInvoice(id);
  refresh();
}

/* ---------------- expenses ---------------- */

export async function saveExpenseAction(_prev: FinState, f: FormData): Promise<FinState> {
  await guard();
  const name = text(f, "name", 120);
  const category = text(f, "category", 60) || "Прочее";
  const amount = num(f, "amount");
  const currency = currencyOf(f);
  const startMonth = text(f, "startMonth", 7);
  const endMonth = text(f, "endMonth", 7);
  if (!name) return { ok: false, message: "Укажите статью." };
  if (amount === null || amount === "bad" || amount < 0) return { ok: false, message: "Сумма должна быть числом." };
  if (!currency) return { ok: false, message: "Выберите валюту." };
  if (!MONTH.test(startMonth)) return { ok: false, message: "Укажите месяц." };
  if (endMonth && !MONTH.test(endMonth)) return { ok: false, message: "Некорректный месяц окончания." };
  await saveExpense({
    id: text(f, "id", 64) || undefined,
    name,
    category,
    amount,
    currency,
    recurring: f.get("recurring") === "on",
    startMonth,
    endMonth: endMonth || null,
    note: text(f, "note", 1000),
  });
  refresh();
  return { ok: true, message: "Расход сохранён." };
}

export async function deleteExpenseAction(id: string) {
  await guard();
  await deleteExpense(id);
  refresh();
}

/* ---------------- staff & payouts ---------------- */

export async function saveStaffAction(_prev: FinState, f: FormData): Promise<FinState> {
  await guard();
  const email = text(f, "email", 200).toLowerCase();
  const name = text(f, "name", 120);
  const base = num(f, "baseSalary");
  const currency = currencyOf(f);
  const since = text(f, "sinceMonth", 7);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Укажите почту сотрудника (как в доступах)." };
  if (!name) return { ok: false, message: "Укажите имя." };
  if (base === "bad") return { ok: false, message: "Оклад должен быть числом." };
  if (!currency) return { ok: false, message: "Выберите валюту." };
  if (!MONTH.test(since)) return { ok: false, message: "Укажите, с какого месяца считать зарплату." };
  await saveStaff({
    email,
    name,
    role: text(f, "role", 30) || "media_buyer",
    baseSalary: base ?? 0,
    currency,
    sinceMonth: since,
    active: f.get("active") === "on",
    note: text(f, "note", 1000),
  });
  refresh();
  return { ok: true, message: "Сотрудник сохранён." };
}

export async function markPayoutAction(email: string, month: string, amount: number, breakdown: unknown) {
  const viewer = await guard();
  if (!MONTH.test(month) || !Number.isFinite(amount)) return;
  await markPayout({ email, month, amount, currency: "USD", breakdown }, viewer.email);
  refresh();
}

export async function unmarkPayoutAction(email: string, month: string) {
  await guard();
  await unmarkPayout(email, month);
  refresh();
}

/* ---------------- agency plan ---------------- */

export async function savePlanAction(_prev: FinState, f: FormData): Promise<FinState> {
  await guard();
  const month = text(f, "month", 7);
  const rev = num(f, "revenuePlan");
  const profit = num(f, "profitPlan");
  if (!MONTH.test(month)) return { ok: false, message: "Нет месяца." };
  if (rev === "bad" || profit === "bad") return { ok: false, message: "План должен быть числом." };
  await savePlan({ month, revenuePlan: rev, profitPlan: profit });
  refresh();
  return { ok: true, message: "План сохранён." };
}

/* ---------------- media buyer rate per project ---------------- */

export async function saveBuyerRateAction(_prev: FinState, f: FormData): Promise<FinState> {
  await guard();
  const projectId = text(f, "projectId", 80);
  const rate = num(f, "rate");
  if (!projectId) return { ok: false, message: "Нет проекта." };
  if (rate === "bad" || (rate !== null && rate < 0)) return { ok: false, message: "Ставка должна быть числом." };
  await saveBuyerRate(projectId, rate);
  refresh();
  return { ok: true, message: "Ставка сохранена." };
}

/* ---------------- terms of single months ---------------- */

export async function saveMonthTermsAction(_prev: FinState, f: FormData): Promise<FinState> {
  await guard();
  const projectId = text(f, "projectId", 80);
  if (!projectId) return { ok: false, message: "Нет проекта." };
  const months = f.getAll("month").map(String).filter((m) => MONTH.test(m));
  const rows = [];
  for (const month of months) {
    const fix = num(f, `fix_${month}`);
    const pct = num(f, `pct_${month}`);
    if (fix === "bad" || pct === "bad" || (fix !== null && fix < 0) || (pct !== null && (pct < 0 || pct > 100))) {
      return { ok: false, message: `Проверьте числа за ${month}.` };
    }
    rows.push({ month, fixAmount: fix, sharePct: pct, note: text(f, `note_${month}`, 300) });
  }
  await saveMonthTerms(projectId, rows);
  refresh();
  return { ok: true, message: "Условия по месяцам сохранены." };
}

/* ---------------- client company details ---------------- */

export async function saveCompanyAction(_prev: FinState, f: FormData): Promise<FinState> {
  await guard();
  const projectId = text(f, "projectId", 80);
  if (!projectId) return { ok: false, message: "Нет проекта." };
  await saveCompany(projectId, String(f.get("company") ?? "").trim().slice(0, 2000));
  refresh();
  return { ok: true, message: "Данные компании сохранены." };
}
