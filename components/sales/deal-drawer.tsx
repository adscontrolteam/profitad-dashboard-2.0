"use client";

import { useActionState, useEffect, useTransition } from "react";
import {
  deleteDealAction,
  saveDealAction,
  type DealActionState,
} from "@/app/(dashboard)/sales/actions";
import { DEAL_STAGES, STAGE_META, type Deal, type DealStage } from "@/lib/sales/stages";

const IDLE: DealActionState = { ok: false, message: null };

export function DealDrawer({
  deal,
  defaultStage,
  onClose,
}: {
  deal: Deal | null;
  defaultStage: DealStage;
  onClose: () => void;
}) {
  const [state, formAction, saving] = useActionState(async (prev: DealActionState, formData: FormData) => {
    const next = await saveDealAction(prev, formData);
    if (next.ok) onClose();
    return next;
  }, IDLE);
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = () => {
    if (!deal || !window.confirm(`Удалить сделку «${deal.name}»?`)) return;
    startDelete(async () => {
      await deleteDealAction(deal.id);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={deal ? deal.name : "Новая сделка"}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-card p-5 shadow-[var(--shadow)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[26px] sm:border sm:border-border lg:p-6"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="section-title">{deal ? "Сделка" : "Новая сделка"}</h2>
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form action={formAction} className="flex flex-1 flex-col gap-4">
          {deal && <input type="hidden" name="id" value={deal.id} />}

          <Field label="Проект / компания">
            <input name="name" required autoFocus defaultValue={deal?.name} className="field" />
          </Field>

          <Field label="Этап">
            <select name="stage" defaultValue={deal?.stage ?? defaultStage} className="field">
              {DEAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_META[stage].label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Контактное лицо">
              <input name="contactName" defaultValue={deal?.contactName} className="field" />
            </Field>
            <Field label="Телефон / почта / Telegram">
              <input name="contact" defaultValue={deal?.contact} className="field" />
            </Field>
            <Field label="Источник">
              <input name="source" defaultValue={deal?.source} placeholder="Рекомендация, сайт…" className="field" />
            </Field>
            <Field label="Бюджет, $ / мес">
              <input
                name="amount"
                inputMode="numeric"
                defaultValue={deal?.amount ?? ""}
                placeholder="0"
                className="field tabular-nums"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Field label="Дата шага">
              <input name="nextActionAt" type="date" defaultValue={deal?.nextActionAt ?? ""} className="field" />
            </Field>
            <Field label="Следующий шаг">
              <input name="nextAction" defaultValue={deal?.nextAction} placeholder="Созвон, отправить КП…" className="field" />
            </Field>
          </div>

          <Field label="Заметки">
            <textarea name="notes" rows={5} defaultValue={deal?.notes} className="field resize-y" />
          </Field>

          {state.message && !state.ok && (
            <p role="alert" className="text-sm font-medium text-negative">
              {state.message}
            </p>
          )}

          <div className="mt-auto flex items-center gap-2 pt-2">
            <button type="submit" className="btn-primary" disabled={saving || deleting}>
              {saving ? "Сохраняю…" : deal ? "Сохранить" : "Добавить"}
            </button>
            {deal && (
              <button
                type="button"
                className="btn-ghost ml-auto text-negative hover:text-negative"
                disabled={saving || deleting}
                onClick={remove}
              >
                {deleting ? "Удаляю…" : "Удалить"}
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
