"use client";

import { useActionState, useState } from "react";
import { saveTermsAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { CURRENCIES } from "@/lib/finance/currency";
import { SHARE_BASES, type Terms } from "@/lib/finance/rules";
import { Drawer, Field, FormError } from "./drawer";

export interface TermsTarget {
  id: string;
  name: string;
  startMonth: string;
  currency: string | null;
  terms: Terms | null;
}

const IDLE: FinState = { ok: false, message: null };

export function TermsButton({ target, label, primary }: { target: TermsTarget; label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={primary ? "btn-primary px-3 py-1.5" : "btn-ghost px-3 py-1.5"} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <TermsDrawer target={target} onClose={() => setOpen(false)} />}
    </>
  );
}

function TermsDrawer({ target, onClose }: { target: TermsTarget; onClose: () => void }) {
  const t = target.terms;
  const [withShare, setWithShare] = useState(Boolean(t?.sharePct));
  const [state, action, saving] = useActionState(async (prev: FinState, f: FormData) => {
    const res = await saveTermsAction(prev, f);
    if (res.ok) onClose();
    return res;
  }, IDLE);

  return (
    <Drawer title={`Условия · ${target.name}`} onClose={onClose}>
      <form action={action} className="flex flex-1 flex-col gap-4">
        <input type="hidden" name="projectId" value={target.id} />
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {[
            { v: false, l: "Фикс" },
            { v: true, l: "Фикс + %" },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              onClick={() => setWithShare(o.v)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${withShare === o.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Фикс в месяц">
            <input name="fixAmount" inputMode="decimal" defaultValue={t?.fixAmount ?? ""} className="field tabular-nums" placeholder="0" />
          </Field>
          <Field label="Валюта договора">
            <select name="currency" defaultValue={t?.currency ?? target.currency ?? "USD"} className="field">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        {withShare && (
          <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
            <Field label="Процент">
              <input name="sharePct" inputMode="decimal" defaultValue={t?.sharePct ?? ""} className="field tabular-nums" placeholder="10" />
            </Field>
            <Field label="От чего" hint={SHARE_BASES[0].hint}>
              <select name="shareBase" defaultValue={t?.shareBase ?? "client_profit"} className="field">
                {SHARE_BASES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Действуют с месяца">
            <input name="startMonth" type="month" defaultValue={t?.startMonth ?? target.startMonth} className="field" />
          </Field>
          <Field label="День оплаты">
            <input name="payDay" inputMode="numeric" defaultValue={t?.payDay ?? ""} className="field" placeholder="5" />
          </Field>
        </div>
        <Field label="Заметки">
          <textarea name="note" rows={3} defaultValue={t?.note ?? ""} className="field resize-y" />
        </Field>
        <FormError message={state.message && !state.ok ? state.message : null} />
        <div className="mt-auto pt-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Сохраняю…" : "Сохранить условия"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
