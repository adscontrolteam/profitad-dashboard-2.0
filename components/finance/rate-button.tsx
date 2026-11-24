"use client";

import { useActionState, useState } from "react";
import { InfoHint } from "@/components/ui/info-hint";
import { saveBuyerRateAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { BUYER_RATE_ONE_SOURCE, SMM_RATES, SMM_SETUP_RATE } from "@/lib/finance/rules";
import { Drawer, Field, FormError } from "./drawer";

const IDLE: FinState = { ok: false, message: null };

/** A specialist's rate for one project: the media buyer's (by traffic sources) or the SMM's (by social networks). */
export function RateButton({
  projectId,
  projectName,
  rate,
  sourcesCount,
  kind = "media_buyer",
  networksCount = 0,
}: {
  projectId: string;
  projectName: string;
  rate: number | null;
  sourcesCount: number;
  kind?: "media_buyer" | "smm";
  networksCount?: number;
}) {
  const smm = kind === "smm";
  const smmHint =
    networksCount > 0
      ? `Пусто = по числу подключённых соцсетей (${networksCount}): 1 — $${SMM_RATES.one}, 2 — $${SMM_RATES.two}, 3+ — $${SMM_RATES.many}. Оформление соцсетей — $${SMM_SETUP_RATE}`
      : `Соцсети проекта не подключены — ставка задаётся вручную: 1 соцсеть — $${SMM_RATES.one}, 2 — $${SMM_RATES.two}, 3+ — $${SMM_RATES.many}, оформление — $${SMM_SETUP_RATE}`;
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
            <input type="hidden" name="kind" value={kind} />
            <Field
              label={smm ? "Ставка SMM за проект, $ в месяц" : "Ставка медиабайера за проект, $ в месяц"}
              hint={
                smm
                  ? smmHint
                  : sourcesCount <= 1
                    ? `Пусто = $${BUYER_RATE_ONE_SOURCE} (один источник трафика)`
                    : `У проекта ${sourcesCount} источника трафика — ставка задаётся вручную`
              }
            >
              <input name="rate" inputMode="decimal" defaultValue={rate ?? ""} className="field tabular-nums" autoFocus />
            </Field>
            <InfoHint caption="На что влияет ставка">От этой ставки считаются −50% при невыполненном KPI и +50% с третьего месяца подряд.</InfoHint>
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
