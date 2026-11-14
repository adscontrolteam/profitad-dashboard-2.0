"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveWeekPlanAction } from "@/app/(dashboard)/projects/week-actions";
import { Card } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/cn";

export interface WeekCell {
  plan: number;
  manual: boolean;
  /** null = the week has not started. */
  fact: number | null;
}

export interface WeekRow {
  /** First day of the row. */
  id: string;
  /** Mondays of the calendar weeks the row covers: one, or two when a short edge of the month joined it. */
  weeks: string[];
  label: string;
  state: "past" | "current" | "future";
  /** Days in the row: 7, or a few more or fewer at the edges of the month. */
  days: number;
  /** Whole days of them already behind. */
  daysPassed: number;
  cells: Record<string, WeekCell | undefined>;
}

export interface WeekColumn {
  metric: string;
  label: string;
  /** Money columns are shown with the currency; the budget is a limit, not a goal. */
  money: boolean;
  isBudget: boolean;
}

const num = (v: number, money: boolean, currency: string | null) =>
  money && currency
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: v > 0 && v < 100 ? 2 : 0 }).format(v)
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: money ? 2 : 1 }).format(v);

/** The month's plan week by week: where the week should be by today, where it is, and a way to correct a week by hand. */
export function WeekPlanCard({
  projectId,
  monthLabel,
  columns,
  rows,
  currency,
  canEdit,
  empty = "plan",
}: {
  projectId: string;
  monthLabel: string;
  columns: WeekColumn[];
  rows: WeekRow[];
  currency: string | null;
  canEdit: boolean;
  /** Why there is nothing to show when there are no columns. */
  empty?: "plan" | "before" | "range";
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (columns.length === 0) {
    return (
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="section-title">План по неделям</h2>
          {monthLabel && <span className="ml-auto text-xs text-muted-foreground">{monthLabel}</span>}
        </div>
        <p className="mt-3 font-display text-2xl font-extrabold text-muted-foreground">—</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {empty === "range"
            ? "По неделям план показывается за один месяц: выберите «Этот месяц», «Прошлый месяц» или диапазон внутри одного месяца."
            : empty === "before"
              ? "В этом месяце проект ещё не был в работе."
              : "На этот месяц план не задан — он ставится во «Вводных»."}
        </p>
      </Card>
    );
  }
  const current = rows.find((r) => r.state === "current");
  const main = columns[0];
  const mainCell = current?.cells[main.metric];

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="section-title">
          План по неделям
          <InfoHint className="ml-2">
            <span className="block">
              План месяца делится на дни, неделя (пн–вс) получает сумму своих дней. Показаны недели этого месяца с 1-го по последнее число.
              Если на краю месяца остаётся меньше четырёх дней, они присоединяются к соседней неделе (например, 1–8): дней в ней больше, и план
              на неё больше ровно на эти дни. Так видно отставание уже на этой неделе, а не в конце месяца.
            </span>
            <span className="mt-2 block">
              Неделю можно поправить вручную: остаток месячного плана сам распределится по остальным неделям, итог за месяц не изменится. «Авто»
              возвращает расчёт. Цвет у идущей недели — относительно того, сколько должно быть к сегодняшнему дню.
            </span>
          </InfoHint>
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">{monthLabel}</span>
      </div>

      {current && mainCell && (
        <p className="mt-2 text-sm text-muted-foreground">
          Эта неделя, {main.label.toLowerCase()}:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {num(mainCell.fact ?? 0, main.money, currency)} из {num(mainCell.plan, main.money, currency)}
          </span>
          {current.daysPassed > 0 && current.daysPassed < current.days && (
            <>
              {" "}
              · к сегодня по плану <span className="tabular-nums">{num((mainCell.plan * current.daysPassed) / current.days, main.money, currency)}</span>
            </>
          )}
          {" "}· прошло {current.daysPassed} из {current.days} дней
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Неделя</th>
              {columns.map((c) => (
                <th key={c.metric} className="whitespace-nowrap pb-2 text-right font-medium" title="Факт / план">
                  {c.label}
                </th>
              ))}
              {canEdit && <th className="pb-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              editing === row.id ? (
                <EditRow key={row.id} projectId={projectId} row={row} columns={columns} onClose={() => setEditing(null)} />
              ) : (
                <tr key={row.id} className={cn(row.state === "current" && "[&>td]:bg-accent/10", row.state === "future" && "text-muted-foreground")}>
                  <td className="whitespace-nowrap rounded-l-[12px] py-2 pl-2 pr-3">
                    <span className="font-medium tabular-nums">{row.label}</span>
                    {row.state === "current" && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">идёт</span>}
                  </td>
                  {columns.map((c) => (
                    <td key={c.metric} className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">
                      <Cell cell={row.cells[c.metric]} column={c} row={row} currency={currency} />
                    </td>
                  ))}
                  {canEdit && (
                    <td className="rounded-r-[12px] py-2 pl-3 pr-2 text-right">
                      {row.state !== "past" && (
                        <button
                          type="button"
                          aria-label={`Изменить план недели ${row.label}`}
                          title="Изменить план недели"
                          className="inline-flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => setEditing(row.id)}
                        >
                          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                          </svg>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Cell({ cell, column, row, currency }: { cell: WeekCell | undefined; column: WeekColumn; row: WeekRow; currency: string | null }) {
  if (!cell) return <span className="text-muted-foreground">—</span>;
  // A running week is judged against what the plan expects by today, a finished one against the whole plan.
  const expected = row.state === "current" ? (cell.plan * row.daysPassed) / row.days : cell.plan;
  const ratio = cell.fact !== null && expected > 0 ? cell.fact / expected : null;
  const tone =
    column.isBudget || ratio === null || row.state === "future" || (row.state === "current" && row.daysPassed === 0)
      ? ""
      : ratio >= 1
        ? "text-positive"
        : ratio >= 0.7
          ? "text-warning"
          : "text-negative";
  return (
    <>
      {cell.fact !== null && <span className={cn("font-semibold", tone)}>{num(cell.fact, column.money, currency)}</span>}
      <span className="text-muted-foreground">
        {cell.fact !== null && " / "}
        {num(cell.plan, column.money, currency)}
      </span>
      {cell.manual && (
        <span className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground" title="План этой недели задан вручную">
          вручную
        </span>
      )}
    </>
  );
}

function EditRow({ projectId, row, columns, onClose }: { projectId: string; row: WeekRow; columns: WeekColumn[]; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(columns.map((c) => [c.metric, row.cells[c.metric] ? String(row.cells[c.metric]?.plan) : ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (payload: Record<string, number | null>) =>
    start(async () => {
      const r = await saveWeekPlanAction(projectId, row.weeks, row.days, payload);
      if (!r.ok) return setError(r.message);
      router.refresh();
      onClose();
    });

  const save = () => {
    const payload: Record<string, number | null> = {};
    for (const c of columns) {
      const raw = values[c.metric].trim().replace(",", ".");
      const before = row.cells[c.metric];
      if (raw === "") {
        if (before?.manual) payload[c.metric] = null;
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) return setError("План — число не меньше нуля.");
      // Untouched automatic numbers stay automatic.
      if (!before || before.manual || v !== before.plan) payload[c.metric] = v;
    }
    send(payload);
  };

  return (
    <tr className="[&>td]:bg-muted/40">
      <td className="rounded-l-[12px] py-2 pl-2 pr-3 font-medium tabular-nums">{row.label}</td>
      {columns.map((c) => (
        <td key={c.metric} className="py-2 pl-3 text-right">
          <input
            inputMode="decimal"
            aria-label={`План: ${c.label}`}
            value={values[c.metric]}
            onChange={(e) => setValues({ ...values, [c.metric]: e.target.value })}
            className="field ml-auto w-24 py-1.5 text-right text-sm tabular-nums"
          />
        </td>
      ))}
      <td className="rounded-r-[12px] py-2 pl-3 pr-2 text-right">
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          {error && <span className="text-xs text-negative">{error}</span>}
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={pending} onClick={save}>
            {pending ? "…" : "Сохранить"}
          </button>
          <button
            type="button"
            className="btn-ghost border border-border px-3 py-1.5 text-xs"
            disabled={pending}
            title="Вернуть автоматическую разбивку месячного плана"
            onClick={() => send(Object.fromEntries(columns.map((c) => [c.metric, null])))}
          >
            Авто
          </button>
          <button type="button" className="btn-ghost px-2 py-1.5 text-xs" onClick={onClose}>
            Отмена
          </button>
        </span>
      </td>
    </tr>
  );
}
