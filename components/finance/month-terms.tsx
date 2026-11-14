"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { saveMonthTermsAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { Drawer, FormError } from "./drawer";
import { monthLabel } from "./ui-labels";

export interface MonthTermsRow {
  month: string;
  fixAmount: number | null;
  sharePct: number | null;
  note: string;
}

const IDLE: FinState = { ok: false, message: null };

/** Small button that opens the window where single months get their own fix / %. */
export function MonthTermsButton({
  projectId,
  projectName,
  months,
  overrides,
  usual,
}: {
  projectId: string;
  projectName: string;
  /** Months that can be changed, newest first. */
  months: string[];
  overrides: MonthTermsRow[];
  usual: { fixAmount: number; sharePct: number | null; currency: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, saving] = useActionState(async (prev: FinState, f: FormData) => {
    const res = await saveMonthTermsAction(prev, f);
    if (res.ok) {
      setOpen(false);
      // The table behind the window shows the months just changed.
      router.refresh();
    }
    return res;
  }, IDLE);
  const by = new Map(overrides.map((o) => [o.month, o]));

  return (
    <>
      <button
        type="button"
        className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground hover:opacity-100"
        onClick={() => setOpen(true)}
      >
        Изменить
      </button>
      {open && (
        <Drawer title={`Условия по месяцам · ${projectName}`} onClose={() => setOpen(false)} wide>
          <form action={action} className="flex flex-1 flex-col gap-4">
            <input type="hidden" name="projectId" value={projectId} />
            <p className="text-sm text-muted-foreground">
              {usual
                ? `Обычные условия: фикс ${usual.fixAmount} ${usual.currency}${usual.sharePct ? ` + ${usual.sharePct}%` : ""}. Заполните только те месяцы, где условия были другими; пустое поле — как обычно.`
                : "Сначала заполните обычные условия клиента — здесь задаются отличия отдельных месяцев."}
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_96px_72px_minmax(0,1.2fr)] items-center gap-x-2 gap-y-2 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Месяц</span>
              <span className="text-xs font-medium text-muted-foreground">Фикс{usual ? `, ${usual.currency}` : ""}</span>
              <span className="text-xs font-medium text-muted-foreground">%</span>
              <span className="text-xs font-medium text-muted-foreground">Почему</span>
              {months.map((m) => {
                const o = by.get(m);
                return (
                  <div key={m} className="contents">
                    <span className={o ? "font-semibold" : undefined}>
                      <input type="hidden" name="month" value={m} />
                      {monthLabel(m)}
                    </span>
                    <input name={`fix_${m}`} inputMode="decimal" defaultValue={o?.fixAmount ?? ""} placeholder={usual ? String(usual.fixAmount) : ""} className="field px-2.5 py-1.5 text-right tabular-nums" aria-label={`Фикс за ${monthLabel(m)}`} />
                    <input name={`pct_${m}`} inputMode="decimal" defaultValue={o?.sharePct ?? ""} placeholder={usual?.sharePct ? String(usual.sharePct) : "—"} className="field px-2.5 py-1.5 text-right tabular-nums" aria-label={`Процент за ${monthLabel(m)}`} />
                    <input name={`note_${m}`} defaultValue={o?.note ?? ""} placeholder="скидка, доп. услуга…" className="field px-2.5 py-1.5" aria-label={`Комментарий за ${monthLabel(m)}`} />
                  </div>
                );
              })}
            </div>
            <FormError message={state.message && !state.ok ? state.message : null} />
            <div className="sticky bottom-0 mt-auto bg-card pt-3">
              <button type="submit" className="btn-primary" disabled={saving || !usual}>
                {saving ? "Сохраняю…" : "Сохранить"}
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}
