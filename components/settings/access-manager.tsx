"use client";

import { useActionState, useState, useTransition } from "react";
import {
  revokeGrantAction,
  saveGrantAction,
  type AccessActionState,
} from "@/app/(dashboard)/settings/access/actions";
import { Card } from "@/components/ui/card";
import { ROLE_META, type AccessGrant, type AssignableRole } from "@/lib/access/roles";
import { cn } from "@/lib/cn";

export type AccessRow =
  | { kind: "admin"; email: string; isSelf: boolean }
  | { kind: "grant"; grant: AccessGrant; isSelf: boolean; editable: boolean };

interface ProjectOption {
  id: string;
  name: string;
}

const IDLE: AccessActionState = { ok: false, message: null };

export function AccessManager({
  rows,
  assignableRoles,
  projects,
}: {
  rows: AccessRow[];
  assignableRoles: AssignableRole[];
  projects: ProjectOption[];
}) {
  const [editing, setEditing] = useState<AccessGrant | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState<AccessActionState>(IDLE);

  const startEdit = (grant: AccessGrant | null) => {
    setEditing(grant);
    setFormKey((k) => k + 1);
    setNotice(IDLE);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] xl:items-start">
      <Card className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Пользователи</h2>
            <p className="mt-1 text-sm text-muted-foreground">Доступ привязан к почте аккаунта.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => startEdit(null)}>
            Выдать доступ
          </button>
        </div>

        {notice.message && (
          <p
            role="status"
            className={cn(
              "mb-3 rounded-full px-4 py-2 text-sm font-medium",
              notice.ok ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative",
            )}
          >
            {notice.message}
          </p>
        )}

        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <UserRow
              key={row.kind === "admin" ? `admin:${row.email}` : row.grant.email}
              row={row}
              projects={projects}
              active={row.kind === "grant" && editing?.email === row.grant.email}
              onEdit={startEdit}
              onRevoked={(state) => {
                setNotice(state);
                if (state.ok && row.kind === "grant" && editing?.email === row.grant.email) startEdit(null);
              }}
            />
          ))}
        </ul>
      </Card>

      <GrantForm
        key={formKey}
        grant={editing}
        assignableRoles={assignableRoles}
        projects={projects}
        onSaved={(state) => {
          setNotice(state);
          setEditing(null);
          setFormKey((k) => k + 1);
        }}
        onCancel={() => startEdit(null)}
      />
    </div>
  );
}

function describeGrant(grant: AccessGrant, projects: ProjectOption[]) {
  if (!grant.role) return `Роль «${grant.storedRole}» из старой схемы — доступа нет, назначьте новую роль.`;
  const projectNames = grant.projectIds
    ? grant.projectIds.map((id) => projects.find((p) => p.id === id)?.name ?? id).join(", ")
    : "все проекты";
  return `${ROLE_META[grant.role].description} · ${projectNames}`;
}

function UserRow({
  row,
  projects,
  active,
  onEdit,
  onRevoked,
}: {
  row: AccessRow;
  projects: ProjectOption[];
  active: boolean;
  onEdit: (grant: AccessGrant) => void;
  onRevoked: (state: AccessActionState) => void;
}) {
  const [pending, startTransition] = useTransition();
  const email = row.kind === "admin" ? row.email : row.grant.email;
  const role = row.kind === "admin" ? "admin" : row.grant.role;
  const roleLabel = role ? ROLE_META[role].label : "Нужна новая роль";

  const revoke = (grant: AccessGrant) => {
    if (!window.confirm(`Отозвать доступ для ${grant.email}?`)) return;
    startTransition(async () => onRevoked(await revokeGrantAction(grant.email)));
  };

  return (
    <li className={cn("flex flex-wrap items-center gap-3 py-3", active && "-mx-3 rounded-[18px] bg-muted px-3")}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold [overflow-wrap:anywhere]">
          {email}
          {row.isSelf && <span className="text-xs font-medium text-muted-foreground">(вы)</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {row.kind === "admin" ? ROLE_META.admin.description : describeGrant(row.grant, projects)}
        </p>
      </div>

      <span
        className={cn(
          "rounded-full px-3 py-1 text-xs font-semibold",
          role === "admin"
            ? "bg-accent text-accent-foreground"
            : role
              ? "bg-muted text-foreground"
              : "bg-warning/15 text-warning",
        )}
      >
        {roleLabel}
      </span>

      {row.kind === "grant" && row.editable ? (
        <div className="flex gap-1">
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => onEdit(row.grant)}>
            Изменить
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-negative hover:text-negative"
            disabled={pending}
            onClick={() => revoke(row.grant)}
          >
            {pending ? "…" : "Отозвать"}
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          {row.kind === "admin" ? "Нельзя изменить" : row.isSelf ? "Ваш доступ" : "Нет прав"}
        </span>
      )}
    </li>
  );
}

function GrantForm({
  grant,
  assignableRoles,
  projects,
  onSaved,
  onCancel,
}: {
  grant: AccessGrant | null;
  assignableRoles: AssignableRole[];
  projects: ProjectOption[];
  onSaved: (state: AccessActionState) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<AssignableRole>(grant?.role ?? assignableRoles[0] ?? "smm");
  const [projectsMode, setProjectsMode] = useState<"all" | "selected">(
    grant?.projectIds ? "selected" : "all",
  );

  const [state, formAction, pending] = useActionState(
    async (prev: AccessActionState, formData: FormData) => {
      const next = await saveGrantAction(prev, formData);
      if (next.ok) onSaved(next);
      return next;
    },
    IDLE,
  );

  return (
    <Card className="min-w-0 xl:sticky xl:top-0">
      <h2 className="section-title">{grant ? "Изменить доступ" : "Выдать доступ"}</h2>

      <form action={formAction} className="mt-5 flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="section-kicker">Почта</span>
          {grant ? (
            <>
              <input type="hidden" name="email" value={grant.email} />
              <span className="field text-muted-foreground">{grant.email}</span>
            </>
          ) : (
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="name@company.com"
              className="field"
            />
          )}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="section-kicker mb-2">Уровень доступа</legend>
          <div className="flex flex-col gap-2">
            {assignableRoles.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer flex-col rounded-[18px] border px-4 py-3 transition-colors",
                  role === option ? "border-ring bg-muted" : "border-border hover:bg-muted/60",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  onChange={() => setRole(option)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{ROLE_META[option].label}</span>
                <span className="text-xs text-muted-foreground">{ROLE_META[option].description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="section-kicker mb-2">Проекты</legend>
          <div className="mb-3 flex gap-2">
            {(["all", "selected"] as const).map((mode) => (
              <label
                key={mode}
                className={cn(
                  "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  projectsMode === mode ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="projectsMode"
                  value={mode}
                  checked={projectsMode === mode}
                  onChange={() => setProjectsMode(mode)}
                  className="sr-only"
                />
                {mode === "all" ? "Все проекты" : "Выбранные"}
              </label>
            ))}
          </div>
          {projectsMode === "selected" && (
            <div className="flex flex-wrap gap-2">
              {projects.map((project) => (
                <Chip
                  key={project.id}
                  name="projectIds"
                  value={project.id}
                  defaultChecked={grant?.projectIds?.includes(project.id)}
                >
                  {project.name}
                </Chip>
              ))}
            </div>
          )}
        </fieldset>


        {state.message && !state.ok && (
          <p role="alert" className="text-sm font-medium text-negative">
            {state.message}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Сохраняю…" : "Сохранить"}
          </button>
          {grant && (
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Отмена
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

function Chip({
  children,
  name,
  value,
  checked,
  defaultChecked,
  onChange,
}: {
  children: React.ReactNode;
  name: string;
  value: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="peer sr-only"
      />
      <span className="inline-flex rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        {children}
      </span>
    </label>
  );
}
