"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { markPayoutAction, saveStaffAction, unmarkPayoutAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { CURRENCIES } from "@/lib/finance/currency";
import { STAFF_ROLES as ROLES } from "@/lib/finance/labels";
import { SMM_TASKS } from "@/lib/finance/rules";
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


const IDLE: FinState = { ok: false, message: null };

/** Someone who can be put on payroll: known from accesses, project owners or the team itself. */
export interface StaffOption {
  email: string;
  name: string;
  role: string;
}

/** A project the person is responsible for, with the day they started on it (null = from the project's start). */
export interface StaffProject {
  email: string;
  projectId: string;
  projectName: string;
  role: string;
  startDate: string | null;
  projectStart: string;
  /** SMM: run | setup | test. */
  task: string;
  /** Sources / networks set for this person; null = as the project has (`autoSources`). */
  sources: number | null;
  autoSources: number;
  /** Responsible for the project in «Вводные»; false = put on the project in this card. */
  owner: boolean;
}

export function StaffButton({
  staff,
  label,
  defaults,
  options = [],
  projects = [],
  allProjects = [],
}: {
  staff: Staff | null;
  label: string;
  defaults?: { email: string; name: string; role: string; sinceMonth: string };
  options?: StaffOption[];
  projects?: StaffProject[];
  /** Every project in work: any of them can be given to the person here. */
  allProjects?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [email, setEmail] = useState(staff?.email ?? defaults?.email ?? "");
  const [name, setName] = useState(staff?.name ?? defaults?.name ?? "");
  const [role, setRole] = useState(staff?.role ?? defaults?.role ?? "media_buyer");
  // Picking a known person fills the name and the role, so they are not typed twice.
  const pickEmail = (value: string) => {
    setEmail(value);
    const known = options.find((o) => o.email === value.trim().toLowerCase());
    if (!known) return;
    if (!name.trim()) setName(known.name);
    setRole(known.role);
  };
  // Projects given to the person in this card and not saved yet.
  const [added, setAdded] = useState<string[]>([]);
  const payRole = role === "smm" ? "smm" : role === "media_buyer" ? "media_buyer" : null;
  const saved = projects.filter((p) => p.email === email.trim().toLowerCase());
  const mine: StaffProject[] = [
    ...saved,
    ...added
      .filter((id) => payRole && !saved.some((p) => p.projectId === id && p.role === payRole))
      .map((id) => ({
        email: email.trim().toLowerCase(),
        projectId: id,
        projectName: allProjects.find((p) => p.id === id)?.name ?? id,
        role: payRole!,
        startDate: null,
        projectStart: "",
        task: "run",
        sources: null,
        autoSources: 0,
        owner: false,
      })),
  ];
  const free = payRole ? allProjects.filter((p) => !mine.some((m) => m.projectId === p.id && m.role === payRole)) : [];
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
            <Field label="Почта (как в доступах и «Вводных»)" hint={s ? undefined : "Выберите из списка или впишите новую"}>
              <input
                name="email"
                value={email}
                onChange={(e) => pickEmail(e.target.value)}
                readOnly={Boolean(s)}
                list={s ? undefined : listId}
                autoComplete="off"
                className="field"
              />
              {!s && (
                <datalist id={listId}>
                  {options.map((o) => (
                    <option key={o.email} value={o.email}>
                      {o.name}
                    </option>
                  ))}
                </datalist>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя">
                <input name="name" value={name} onChange={(e) => setName(e.target.value)} className="field" />
              </Field>
              <Field label="Роль">
                <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="field">
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
            {(mine.length > 0 || free.length > 0) && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Проекты</span>
                {mine.map((p) => {
                  const tail = `${p.role}|${p.projectId}`;
                  const smm = p.role === "smm";
                  return (
                    <div key={tail} className="flex flex-col gap-2 rounded-[14px] border border-border px-3 py-2.5 text-sm">
                      <input type="hidden" name={`row|${tail}`} value={p.owner ? "owner" : "added"} />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.projectName}</span>
                        <span className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === p.role)?.label ?? p.role}</span>
                        {p.owner ? (
                          <span className="ml-auto text-xs text-muted-foreground">ответственный во «Вводных»</span>
                        ) : (
                          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input type="checkbox" name={`remove|${tail}`} /> убрать с проекта
                          </label>
                        )}
                      </div>
                      <div className={`grid gap-2 ${smm ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                        {smm && (
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-muted-foreground">Задача</span>
                            <select name={`task|${tail}`} defaultValue={p.task} className="field py-1.5">
                              {SMM_TASKS.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted-foreground">{smm ? "Соцсетей" : "Источников трафика"}</span>
                          <input
                            name={`sources|${tail}`}
                            inputMode="numeric"
                            defaultValue={p.sources ?? ""}
                            placeholder={p.autoSources ? `${p.autoSources} — как в проекте` : "не задано"}
                            className="field py-1.5 tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-muted-foreground">На проекте с</span>
                          <input type="date" name={`start|${tail}`} defaultValue={p.startDate ?? ""} className="field py-1.5 tabular-nums" />
                        </label>
                      </div>
                    </div>
                  );
                })}
                {free.length > 0 && (
                  <select
                    className="field"
                    value=""
                    onChange={(e) => e.target.value && setAdded((list) => [...list, e.target.value])}
                    aria-label="Добавить проект"
                  >
                    <option value="">+ Добавить проект</option>
                    {free.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <span className="text-xs text-muted-foreground">
                  Ставка идёт от числа источников: медиабайер — один источник $150, два — $225, больше — задаётся кнопкой «Ставка»; SMM — 1 соцсеть $120, 2 — $150, 3+ —
                  $200. Оформление — $100, тест — половина ставки; на них KPI не влияет. Проект считается целыми месяцами: начал до 7-го числа — зарплата за этот месяц,
                  позже — первая зарплата пишется на следующий. Пустая дата — с начала проекта.
                </span>
              </div>
            )}
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
