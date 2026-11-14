"use client";

import { useActionState, useState, useTransition } from "react";
import { archiveMethodAction, saveMethodAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { CURRENCIES } from "@/lib/finance/currency";
import { METHOD_FIELDS, METHOD_KINDS, recipientRows, type MethodKind } from "@/lib/finance/methods";
import type { PaymentMethod } from "@/lib/finance/store";
import { Drawer, Field, FormError } from "./drawer";

const IDLE: FinState = { ok: false, message: null };

export function MethodsList({ methods }: { methods: PaymentMethod[] }) {
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {methods.map((m) => {
          const rows = recipientRows(m.kind, m.details, undefined, m.currency);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setEditing(m)}
              className="flex flex-col gap-1 rounded-[16px] border border-border bg-background/70 px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <b className="text-sm">{m.label}</b>
                <span className="ml-auto text-xs text-muted-foreground">{m.currency}</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {rows.length ? rows.filter((r) => r.label !== "Валюта").map((r) => r.value).slice(0, 2).join(" · ") : "Ссылка вставляется в каждом счёте"}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-[16px] border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          + Добавить реквизиты
        </button>
      </div>
      {editing && <MethodDrawer method={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MethodDrawer({ method, onClose }: { method: PaymentMethod | null; onClose: () => void }) {
  const [kind, setKind] = useState<MethodKind>((method?.kind as MethodKind) ?? "fop");
  const [archiving, start] = useTransition();
  const [state, action, saving] = useActionState(async (prev: FinState, f: FormData) => {
    const res = await saveMethodAction(prev, f);
    if (res.ok) onClose();
    return res;
  }, IDLE);

  return (
    <Drawer title={method ? method.label : "Новые реквизиты"} onClose={onClose}>
      <form action={action} className="flex flex-1 flex-col gap-4">
        {method && <input type="hidden" name="id" value={method.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Название">
            <input name="label" defaultValue={method?.label} required className="field" placeholder="ФОП 2 группа" />
          </Field>
          <Field label="Тип">
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as MethodKind)} className="field">
              {METHOD_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {METHOD_FIELDS[kind].map((f) => (
          <Field key={f.key} label={f.label}>
            <input name={`d_${f.key}`} defaultValue={method?.details[f.key] ?? ""} placeholder={f.placeholder} className="field" />
          </Field>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Валюта по умолчанию">
            <select name="currency" defaultValue={method?.currency ?? "UAH"} className="field">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Услуга по умолчанию">
            <input name="serviceName" defaultValue={method?.serviceName ?? ""} className="field" placeholder="Інформаційні послуги" />
          </Field>
        </div>
        <Field label="Призначення платежу по умолчанию">
          <input name="purpose" defaultValue={method?.purpose ?? ""} className="field" placeholder="Оплата за інформаційні послуги" />
        </Field>
        <FormError message={state.message && !state.ok ? state.message : null} />
        <div className="mt-auto flex items-center gap-2 pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
          {method && (
            <button
              type="button"
              className="btn-ghost ml-auto text-negative hover:text-negative"
              disabled={archiving}
              onClick={() =>
                window.confirm(`Убрать «${method.label}» из списка? Старые счета не изменятся.`) &&
                start(async () => {
                  await archiveMethodAction(method.id);
                  onClose();
                })
              }
            >
              Убрать
            </button>
          )}
        </div>
      </form>
    </Drawer>
  );
}
