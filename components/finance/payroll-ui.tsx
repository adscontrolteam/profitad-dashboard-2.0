"use client";

import { useActionState, useState, useTransition } from "react";
import { markPayoutAction, saveStaffAction, unmarkPayoutAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { CURRENCIES } from "@/lib/finance/currency";
import type { Staff } from "@/lib/finance/store";
import { Drawer, Field, FormError } from "./drawer";

export function PayoutButton({ email, month, amount, breakdown, paid }: { email: string; month: string; amount: number; breakdown: unknown; paid: boolean }) {
  const [busy, start] = useTransition();
  return paid ? (
    <button type="button" className="btn-ghost px-3 py-1.5" disabled={busy} onClick={() => start(() => unmarkPayoutAction(email, month))}>
      Отменить отметку
    </button>
  ) : (
    <button type="button" className="btn-primary" disabled={busy} onClick={() => start(() => markPayoutAction(email, month, amount, breakdown))}>
      {busy ? "Сохраняю…" : "Выплачено"}
    </button>
  );
}

const ROLES = [
  { value: "media_buyer", label: "MediaBuyer" },
  { value: "smm", label: "SMM" },
  { value: "sales", label: "Sales" },
  { value: "other", label: "Другое" },
];
export const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

const IDLE: FinState = { ok: false, message: null };

export function StaffButton({ staff, label, defaults }: { staff: Staff | null; label: string; defaults?: { email: string; name: string; role: string; sinceMonth: string } }) {
  const [open, setOpen] = useState(false);
  const [state, action, saving] = useActionState(async (prev: FinState, f: FormData) => {
    const res = await saveStaffAction(prev, f);
    if (res.ok) setOpen(false);
    return res;
  }, IDLE);
  const s = staff;
  return (
    <>
      <button type="button" className={s ? "btn-ghost px-3 py-1.5" : "btn-primary px-3 py-1.5"} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Drawer title={s?.name ?? defaults?.name ?? "Сотрудник"} onClose={() => setOpen(false)}>
          <form action={action} className="flex flex-1 flex-col gap-4">
            <Field label="Почта (как в доступах и «Вводных»)">
              <input name="email" defaultValue={s?.email ?? defaults?.email ?? ""} readOnly={Boolean(s)} className="field" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя">
                <input name="name" defaultValue={s?.name ?? defaults?.name ?? ""} className="field" />
              </Field>
              <Field label="Роль">
                <select name="role" defaultValue={s?.role ?? defaults?.role ?? "media_buyer"} className="field">
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Оклад в месяц (кроме ставок за проекты)">
                <input name="baseSalary" inputMode="decimal" defaultValue={s?.baseSalary || ""} placeholder="0" className="field tabular-nums" />
              </Field>
              <Field label="Валюта оклада">
                <select name="currency" defaultValue={s?.currency ?? "USD"} className="field">
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Считать зарплату с месяца">
                <input name="sinceMonth" type="month" defaultValue={s?.sinceMonth ?? defaults?.sinceMonth} className="field" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={s?.active ?? true} /> Работает сейчас
            </label>
            <Field label="Заметки">
              <textarea name="note" rows={3} defaultValue={s?.note ?? ""} className="field resize-y" />
            </Field>
            <FormError message={state.message && !state.ok ? state.message : null} />
            <div className="mt-auto pt-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Сохраняю…" : "Сохранить"}
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}
