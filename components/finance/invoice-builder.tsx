"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveInvoiceAction, type InvoicePayload } from "@/app/(dashboard)/finance/actions";
import type { InvoiceItem } from "@/db/schema";
import { cn } from "@/lib/cn";
import { CURRENCIES, convert, type Rates } from "@/lib/finance/currency";
import { formatInvoiceAmount } from "@/lib/finance/methods";
import type { Invoice, PaymentMethod } from "@/lib/finance/store";
import { Field, FormError } from "./drawer";
import { InvoiceDocument } from "./invoice-document";
import { InvoiceIntlDocument } from "./invoice-intl-document";

export interface ProjectOption {
  id: string;
  name: string;
  /** Currency of the client's terms; null = no terms yet. */
  currency: string | null;
  /** The client's company details for «BILL TO» (from the client's card). */
  company: string;
  /** Amount due by the terms, per month (terms currency). */
  due: Record<string, { amount: number; currency: string }>;
}

export function InvoiceBuilder({
  projects,
  methods,
  rates,
  initial,
  defaults,
}: {
  projects: ProjectOption[];
  methods: PaymentMethod[];
  rates: Rates;
  initial: Invoice | null;
  defaults: { projectId: string | null; month: string; issueDate: string };
}) {
  const router = useRouter();
  // An edited invoice keeps its own account (even if that account was archived since).
  const firstMethod = initial ? (methods.find((m) => m.id === initial.methodId) ?? null) : (methods[0] ?? null);
  const [projectId, setProjectId] = useState<string>(initial?.projectId ?? defaults.projectId ?? "");
  const [month, setMonth] = useState(initial?.month ?? defaults.month);
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? defaults.issueDate);
  const [methodId, setMethodId] = useState<string | null>(firstMethod?.id ?? null);
  const [currency, setCurrency] = useState(initial?.currency ?? firstMethod?.currency ?? "UAH");
  const [items, setItems] = useState<InvoiceItem[]>(
    initial?.items.length ? initial.items : [{ name: firstMethod?.serviceName || "Інформаційні послуги", qty: 1, amount: 0 }],
  );
  const [purpose, setPurpose] = useState(initial?.purpose ?? firstMethod?.purpose ?? "");
  const [payLink, setPayLink] = useState(initial?.payLink ?? "");
  const [showPayer, setShowPayer] = useState(Boolean(initial?.recipient?.payer));
  const [note, setNote] = useState(initial?.note ?? "");
  // The agreed rate typed by hand; empty = the NBU rate of today.
  const [rateInput, setRateInput] = useState(initial?.fxRate ? String(initial.fxRate) : "");
  // English INVOICE (payment link): which FOP it is from, the client's company, and whether it is already paid.
  const fops = methods.filter((m) => m.kind === "fop");
  const [senderId, setSenderId] = useState<string | null>(
    (initial?.recipient?.intl ? fops.find((m) => m.label === initial.recipient!.intl!.fromLabel)?.id : fops[0]?.id) ?? null,
  );
  const [billTo, setBillTo] = useState(
    initial?.recipient?.intl?.billTo ?? projects.find((p) => p.id === (initial?.projectId ?? defaults.projectId))?.company ?? "",
  );
  const [paid, setPaid] = useState(initial ? initial.status === "paid" : true);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const method = methods.find((m) => m.id === methodId) ?? null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const due = project?.due[month] ?? null;
  const contractCurrency = project?.currency ?? initial?.contractCurrency ?? null;
  const needsRate = Boolean(contractCurrency && contractCurrency !== currency);
  const nbuRate = needsRate ? Math.round(convert(1, contractCurrency!, currency, rates) * 10000) / 10000 : 1;
  const typedRate = Number(rateInput.replace(/\s/g, "").replace(",", "."));
  const rate = needsRate ? (rateInput && Number.isFinite(typedRate) && typedRate > 0 ? typedRate : nbuRate) : 1;
  const total = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const dueConverted = due ? Math.round(due.amount * (due.currency === currency ? 1 : rate) * 100) / 100 : null;

  const pickMethod = (m: PaymentMethod) => {
    setMethodId(m.id);
    setCurrency(m.currency);
    setRateInput("");
    if (m.serviceName) setItems((list) => list.map((it, i) => (i === 0 ? { ...it, name: m.serviceName } : it)));
    if (m.purpose) setPurpose(m.purpose);
  };

  const isIntl = method ? method.kind === "link" : Boolean(initial?.recipient?.intl);
  const sender = fops.find((m) => m.id === senderId) ?? null;
  const intl = isIntl
    ? { fromLabel: sender?.label ?? initial?.recipient?.intl?.fromLabel ?? "", from: sender?.details ?? initial?.recipient?.intl?.from ?? {}, billTo }
    : undefined;
  const recipient = method
    ? { kind: method.kind, label: method.label, details: method.details, ...(showPayer && project && !isIntl ? { payer: project.name } : {}), ...(intl ? { intl } : {}) }
    : initial?.recipient
      ? { ...initial.recipient, ...(intl ? { intl } : {}) }
      : null;

  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const save = (print: boolean) => {
    setError(null);
    const payload: InvoicePayload = {
      id: initial?.id,
      projectId: projectId || null,
      month,
      issueDate,
      methodId,
      recipient,
      currency,
      items,
      purpose,
      payLink,
      contractCurrency: needsRate ? contractCurrency : null,
      fxRate: needsRate ? rate : null,
      document: true,
      // An English invoice is usually issued after the client has paid by the link.
      status: isIntl ? (paid ? "paid" : "issued") : initial?.status === "paid" ? "paid" : "issued",
      paidDate: isIntl ? (paid ? (initial?.paidDate ?? issueDate) : null) : (initial?.paidDate ?? null),
      note,
    };
    start(async () => {
      const res = await saveInvoiceAction(payload);
      if (!res.ok || !res.id) return setError(res.message);
      router.push(print ? `/invoice/${res.id}?print=1` : "/finance/invoices");
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Проект">
            <select
              className="field"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setRateInput("");
                const company = projects.find((p) => p.id === e.target.value)?.company;
                if (company) setBillTo(company);
              }}
            >
              <option value="">Без проекта</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="За месяц">
            <input type="month" className="field" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="Дата счёта">
            <input type="date" className="field" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="Валюта счёта">
            <select
              className="field"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setRateInput("");
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>

        {needsRate && (
          <div className="flex flex-col gap-1.5 rounded-[16px] bg-muted px-3 py-3">
            <span className="text-xs font-medium text-muted-foreground">
              Курс: договор в {contractCurrency}, счёт в {currency}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="whitespace-nowrap">1 {contractCurrency} =</span>
              <input
                className="field w-[120px] text-right tabular-nums"
                inputMode="decimal"
                value={rateInput}
                placeholder={String(nbuRate)}
                onChange={(e) => setRateInput(e.target.value)}
                aria-label="Курс"
              />
              <span>{currency}</span>
              <button type="button" className="btn-ghost ml-auto px-3 py-1" onClick={() => setRateInput("")}>
                НБУ {nbuRate}
              </button>
            </div>
            {total > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Счёт на {formatInvoiceAmount(total)} {currency} = {formatInvoiceAmount(total / rate)} {contractCurrency} по этому курсу. Курс сохраняется в счёте.
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Реквизиты</span>
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMethod(m)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  m.id === methodId ? "border-transparent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {!methods.length && <span className="text-sm text-muted-foreground">Добавьте реквизиты на странице «Инвойсы».</span>}
        </div>

        {isIntl && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">От кого (FROM)</span>
              <div className="flex flex-wrap gap-1.5">
                {fops.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSenderId(m.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      m.id === senderId ? "border-transparent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {sender && !sender.details.nameEn && (
                <span className="text-xs text-warning">У «{sender.label}» не заполнены данные на английском — добавьте их в «Реквизитах» на странице «Инвойсы».</span>
              )}
            </div>
            <Field label="Кому (BILL TO)" hint="Данные компании клиента, каждая строка с новой строки. Сохраняются в карточке клиента">
              <textarea className="field resize-y" rows={6} value={billTo} onChange={(e) => setBillTo(e.target.value)} placeholder={"COMPANY SP. Z O. O.\nul. …\nNIP: …"} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              Уже оплачен (PAID) — счёт выставляется после оплаты
            </label>
            <Field label="Ссылка Way4Pay" hint="Для себя: по какой ссылке клиент платил. В инвойс не попадает">
              <input className="field" value={payLink} onChange={(e) => setPayLink(e.target.value)} placeholder="https://secure.wayforpay.com/…" />
            </Field>
          </>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Услуги</span>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_48px_112px_32px] items-center gap-2">
              <input className="field" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Найменування" />
              <input className="field px-2 text-center" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) || 1 })} />
              <input
                className="field text-right tabular-nums"
                inputMode="decimal"
                value={it.amount || ""}
                placeholder="0,00"
                onChange={(e) => setItem(i, { amount: Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0 })}
              />
              <button
                type="button"
                aria-label="Убрать строку"
                className="btn-ghost size-8 p-0"
                disabled={items.length === 1}
                onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost self-start px-3 py-1.5" onClick={() => setItems((l) => [...l, { name: "", qty: 1, amount: 0 }])}>
            + Строка
          </button>
          {due && dueConverted !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-[16px] bg-muted px-3 py-2.5 text-[13px]">
              <span>
                По условиям за месяц: <b className="tabular-nums">{formatInvoiceAmount(due.amount)} {due.currency}</b>
                {due.currency !== currency && (
                  <>
                    {" "}= <b className="tabular-nums">{formatInvoiceAmount(dueConverted)} {currency}</b> по курсу {rate}
                  </>
                )}
              </span>
              <button type="button" className="btn-ghost ml-auto px-3 py-1" onClick={() => setItem(0, { amount: dueConverted })}>
                Подставить
              </button>
            </div>
          )}
        </div>

        {!isIntl && (
          <>
            <Field label="Призначення платежу">
              <input className="field" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showPayer} onChange={(e) => setShowPayer(e.target.checked)} disabled={!project} />
              Указать платника (название проекта) в счёте
            </label>
          </>
        )}

        <Field label="Заметка для себя" hint="В счёт не попадает">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <FormError message={error} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}>
            {saving ? "Сохраняю…" : "Сохранить и скачать PDF"}
          </button>
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => save(false)}>
            Сохранить
          </button>
          <Link href="/finance/invoices" className="btn-ghost ml-auto">
            Отмена
          </Link>
        </div>
      </div>

      <div className="min-w-0 rounded-[var(--radius)] bg-muted/60 p-3 sm:p-6">
        {intl ? (
          <InvoiceIntlDocument doc={{ issueDate, currency, items, paid, intl }} />
        ) : (
          <InvoiceDocument doc={{ issueDate, recipient, currency, items, purpose, payLink, payer: recipient?.payer ?? null }} />
        )}
      </div>
    </div>
  );
}
