"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteExpenseAction, saveExpenseAction, savePlanAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { CURRENCIES } from "@/lib/finance/currency";
import type { Expense } from "@/lib/finance/store";
import { Drawer, Field, FormError } from "./drawer";

export const EXPENSE_CATEGORIES = ["Сервисы", "Офис", "Маркетинг агентства", "Бухгалтерия", "Налоги", "Обучение", "Разовые", "Прочее"];

const IDLE: FinState = { ok: false, message: null };

export function ExpenseButton({ expense, label, month }: { expense: Expense | null; label: string; month: string }) {
  const [open, setOpen] = useState(false);
  const [removing, start] = useTransition();
  const [state, action, saving] = useActionState(async (prev: FinState, f: FormData) => {
    const res = await saveExpenseAction(prev, f);
    if (res.ok) setOpen(false);
    return res;
  }, IDLE);
  const e = expense;
  return (
    <>
      <button type="button" className={e ? "btn-ghost px-3 py-1.5" : "btn-primary"} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Drawer title={e ? e.name : "Новый расход"} onClose={() => setOpen(false)}>
          <form action={action} className="flex flex-1 flex-col gap-4">
            {e && <input type="hidden" name="id" value={e.id} />}
            <Field label="Статья">
              <input name="name" defaultValue={e?.name} required className="field" placeholder="Google Workspace" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Категория">
                <input name="category" list="expense-categories" defaultValue={e?.category ?? "Сервисы"} className="field" />
                <datalist id="expense-categories">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <Field label="Сумма">
                  <input name="amount" inputMode="decimal" defaultValue={e?.amount ?? ""} required className="field tabular-nums" />
                </Field>
                <Field label="Валюта">
                  <select name="currency" defaultValue={e?.currency ?? "USD"} className="field px-2">
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="recurring" defaultChecked={e?.recurring ?? true} /> Каждый месяц
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Месяц (или начало)">
                <input name="startMonth" type="month" defaultValue={e?.startMonth ?? month} className="field" />
              </Field>
              <Field label="До месяца" hint="Пусто — пока не отменим">
                <input name="endMonth" type="month" defaultValue={e?.endMonth ?? ""} className="field" />
              </Field>
            </div>
            <Field label="Заметка">
              <input name="note" defaultValue={e?.note ?? ""} className="field" />
            </Field>
            <FormError message={state.message && !state.ok ? state.message : null} />
            <div className="mt-auto flex items-center gap-2 pt-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Сохраняю…" : "Сохранить"}
              </button>
              {e && (
                <button
                  type="button"
                  className="btn-ghost ml-auto text-negative hover:text-negative"
                  disabled={removing}
                  onClick={() =>
                    window.confirm(`Удалить «${e.name}» за все месяцы? Чтобы остановить регулярный расход, укажите «До месяца».`) &&
                    start(async () => {
                      await deleteExpenseAction(e.id);
                      setOpen(false);
                    })
                  }
                >
                  Удалить
                </button>
              )}
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}

export function PlanForm({ month, revenuePlan, profitPlan }: { month: string; revenuePlan: number | null; profitPlan: number | null }) {
  const [state, action, saving] = useActionState(savePlanAction, IDLE);
  return (
    <form action={action} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="month" value={month} />
      <input name="revenuePlan" defaultValue={revenuePlan ?? ""} placeholder="доход" inputMode="decimal" className="field w-[96px] py-1 text-right tabular-nums" />
      <input name="profitPlan" defaultValue={profitPlan ?? ""} placeholder="прибыль" inputMode="decimal" className="field w-[96px] py-1 text-right tabular-nums" />
      <button type="submit" className="btn-ghost px-2.5 py-1" disabled={saving} title={state.message ?? undefined}>
        {saving ? "…" : state.ok ? "✓" : "OK"}
      </button>
    </form>
  );
}
