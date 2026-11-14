"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteInvoiceAction, saveInvoiceAction, setInvoiceStatusAction } from "@/app/(dashboard)/finance/actions";
import { CURRENCIES } from "@/lib/finance/currency";
import type { PaymentMethod } from "@/lib/finance/store";
import { Drawer, Field, FormError } from "./drawer";

export function InvoiceRowActions({ id, status, document }: { id: string; status: "issued" | "paid" | "cancelled"; document: boolean }) {
  const [busy, start] = useTransition();
  const [paying, setPaying] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <div className="flex items-center justify-end gap-1">
      {document && (
        <Link href={`/invoice/${id}?print=1`} className="btn-ghost px-3 py-1.5" target="_blank">
          PDF
        </Link>
      )}
      {document && status !== "cancelled" && (
        <Link href={`/finance/invoices/new?id=${id}`} className="btn-ghost px-3 py-1.5">
          Изменить
        </Link>
      )}
      {status === "issued" &&
        (paying ? (
          <span className="flex items-center gap-1">
            <input type="date" className="field w-[150px] py-1" value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="button" className="btn-primary px-3 py-1.5" disabled={busy} onClick={() => run(() => setInvoiceStatusAction(id, "paid", date))}>
              OK
            </button>
          </span>
        ) : (
          <button type="button" className="btn-primary px-3 py-1.5" onClick={() => setPaying(true)}>
            Оплачен
          </button>
        ))}
      {status === "paid" && (
        <button type="button" className="btn-ghost px-3 py-1.5" disabled={busy} onClick={() => run(() => setInvoiceStatusAction(id, "issued"))}>
          Не оплачен
        </button>
      )}
      {status === "issued" && (
        <button type="button" className="btn-ghost px-3 py-1.5" disabled={busy} onClick={() => run(() => setInvoiceStatusAction(id, "cancelled"))}>
          Отменить
        </button>
      )}
      {(status === "cancelled" || !document) && (
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-negative hover:text-negative"
          disabled={busy}
          onClick={() => window.confirm("Удалить запись?") && run(() => deleteInvoiceAction(id))}
        >
          Удалить
        </button>
      )}
    </div>
  );
}

/** A payment received without an invoice from the dashboard (e.g. a direct transfer). */
export function RecordPaymentButton({
  projects,
  methods,
  month,
}: {
  projects: { id: string; name: string; currency: string | null }[];
  methods: PaymentMethod[];
  month: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const submit = (f: FormData) => {
    setError(null);
    const method = methods.find((m) => m.id === f.get("methodId")) ?? null;
    const contract = projects.find((p) => p.id === f.get("projectId"))?.currency ?? null;
    const fxRate = Number(String(f.get("fxRate") ?? "").replace(/\s/g, "").replace(",", "."));
    const withRate = contract && contract !== f.get("currency") && fxRate > 0;
    start(async () => {
      const res = await saveInvoiceAction({
        projectId: String(f.get("projectId") || "") || null,
        month: String(f.get("month")),
        issueDate: String(f.get("paidDate")),
        methodId: method?.id ?? null,
        recipient: method ? { kind: method.kind, label: method.label, details: method.details } : null,
        currency: String(f.get("currency")),
        items: [{ name: "Оплата", qty: 1, amount: Number(String(f.get("amount")).replace(/\s/g, "").replace(",", ".")) }],
        purpose: "",
        payLink: "",
        contractCurrency: withRate ? contract : null,
        fxRate: withRate ? fxRate : null,
        document: false,
        status: "paid",
        paidDate: String(f.get("paidDate")),
        note: String(f.get("note") ?? ""),
      });
      if (!res.ok) return setError(res.message);
      setOpen(false);
    });
  };

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        Записать оплату без счёта
      </button>
      {open && (
        <Drawer title="Оплата без счёта" onClose={() => setOpen(false)}>
          <form action={submit} className="flex flex-1 flex-col gap-4">
            <Field label="Проект">
              <select name="projectId" className="field">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Сумма">
                <input name="amount" inputMode="decimal" required className="field tabular-nums" />
              </Field>
              <Field label="Валюта">
                <select name="currency" className="field" defaultValue="USD">
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="За месяц">
                <input name="month" type="month" defaultValue={month} className="field" />
              </Field>
              <Field label="Дата оплаты">
                <input name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="field" />
              </Field>
            </div>
            <Field label="Курс к валюте договора" hint="Если оплата в другой валюте: сколько её единиц за 1 единицу валюты договора. Пусто — по курсу НБУ">
              <input name="fxRate" inputMode="decimal" className="field tabular-nums" placeholder="например 50,2" />
            </Field>
            <Field label="Куда пришла">
              <select name="methodId" className="field">
                <option value="">—</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Заметка">
              <input name="note" className="field" />
            </Field>
            <FormError message={error} />
            <div className="mt-auto pt-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Сохраняю…" : "Записать"}
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}
