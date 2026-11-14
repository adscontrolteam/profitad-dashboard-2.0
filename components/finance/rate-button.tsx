"use client";

import { useActionState, useState } from "react";
import { saveBuyerRateAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { BUYER_RATE_ONE_SOURCE } from "@/lib/finance/rules";
import { Drawer, Field, FormError } from "./drawer";

const IDLE: FinState = { ok: false, message: null };

/** Media buyer's rate for one project (default: one traffic source). */
export function RateButton({ projectId, projectName, rate, sourcesCount }: { projectId: string; projectName: string; rate: number | null; sourcesCount: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, saving] = useActionState(async (prev: FinState, f: FormData) => {
    const res = await saveBuyerRateAction(prev, f);
    if (res.ok) setOpen(false);
    return res;
  }, IDLE);
  return (
    <>
      <button type="button" className={rate === null ? "btn-primary px-3 py-1" : "btn-ghost px-3 py-1"} onClick={() => setOpen(true)}>
        {rate === null ? "Задать ставку" : "Ставка"}
      </button>
      {open && (
        <Drawer title={`Ставка · ${projectName}`} onClose={() => setOpen(false)}>
          <form action={action} className="flex flex-1 flex-col gap-4">
            <input type="hidden" name="projectId" value={projectId} />
            <Field
              label="Ставка медиабайера за проект, $ в месяц"
              hint={
                sourcesCount <= 1
                  ? `Пусто = $${BUYER_RATE_ONE_SOURCE} (один источник трафика)`
                  : `У проекта ${sourcesCount} источника трафика — ставка задаётся вручную`
              }
            >
              <input name="rate" inputMode="decimal" defaultValue={rate ?? ""} className="field tabular-nums" autoFocus />
            </Field>
            <p className="text-sm text-muted-foreground">От этой ставки считаются −50% при невыполненном KPI и +50% с третьего месяца подряд.</p>
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
