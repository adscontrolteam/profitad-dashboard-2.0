"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  addCommentAction,
  archiveTasksAction,
  deleteCommentAction,
  deleteTaskAction,
  loadCommentsAction,
  saveTaskAction,
  type TaskActionState,
} from "@/app/(dashboard)/tasks/actions";
import { TASK_STAGE_META, TASK_STAGES, type Task, type TaskComment, type TaskStage, type TeamMember } from "@/lib/tasks/stages";
import { Avatar } from "./task-board";
import { memberLabel, type TaskProject } from "./types";

const IDLE: TaskActionState = { ok: false, message: null };

const commentTime = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function TaskDrawer({
  task,
  defaultStage,
  projects,
  team,
  viewerEmail,
  canModerate,
  onClose,
}: {
  task: Task | null;
  defaultStage: TaskStage;
  projects: TaskProject[];
  team: TeamMember[];
  viewerEmail: string;
  canModerate: boolean;
  onClose: () => void;
}) {
  const [state, formAction, saving] = useActionState(async (prev: TaskActionState, formData: FormData) => {
    const next = await saveTaskAction(prev, formData);
    if (next.ok) onClose();
    return next;
  }, IDLE);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = () => {
    if (!task || !window.confirm(`Удалить задачу «${task.title}» навсегда? Для скрытия лучше отправить её в архив.`)) return;
    startBusy(async () => {
      await deleteTaskAction(task.id);
      onClose();
    });
  };

  const archive = () => {
    if (!task) return;
    startBusy(async () => {
      await archiveTasksAction([task.id]);
      onClose();
    });
  };

  const assigneeOptions =
    task?.assigneeEmail && !team.some((m) => m.email === task.assigneeEmail)
      ? [...team, { email: task.assigneeEmail, name: null, imageUrl: null }]
      : team;

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
        aria-label={task ? task.title : "Новая задача"}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-card p-5 shadow-[var(--shadow)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[26px] sm:border sm:border-border lg:p-6"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="section-title">{task ? "Задача" : "Новая задача"}</h2>
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          {task && <input type="hidden" name="id" value={task.id} />}

          <Field label="Название задачи">
            <input name="title" required autoFocus={!task} defaultValue={task?.title} className="field" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Проект">
              <select name="projectId" defaultValue={task?.projectId ?? ""} className="field">
                <option value="">Без проекта</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.archived ? " (архив)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Этап">
              <select name="stage" defaultValue={task?.stage ?? defaultStage} className="field">
                {TASK_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {TASK_STAGE_META[stage].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Исполнитель">
              <select name="assigneeEmail" defaultValue={task?.assigneeEmail ?? ""} className="field">
                <option value="">Не назначен</option>
                {assigneeOptions.map((m) => (
                  <option key={m.email} value={m.email}>
                    {memberLabel(m, m.email)}
                    {m.email === viewerEmail ? " (я)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дедлайн">
              <input name="deadline" type="date" defaultValue={task?.deadline ?? ""} className="field" />
            </Field>
          </div>

          <Field label="Описание">
            <textarea
              name="description"
              rows={6}
              defaultValue={task?.description}
              placeholder="Что нужно сделать, критерии готовности, ссылки…"
              className="field resize-y"
            />
          </Field>

          {state.message && !state.ok && (
            <p role="alert" className="text-sm font-medium text-negative">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" className="btn-primary" disabled={saving || busy}>
              {saving ? "Сохраняю…" : task ? "Сохранить" : "Добавить"}
            </button>
            {task && (
              <>
                <button type="button" className="btn-ghost" disabled={saving || busy} onClick={archive}>
                  В архив
                </button>
                <button
                  type="button"
                  className="btn-ghost ml-auto text-negative hover:text-negative"
                  disabled={saving || busy}
                  onClick={remove}
                >
                  Удалить
                </button>
              </>
            )}
          </div>
        </form>

        {task && <Comments taskId={task.id} team={team} viewerEmail={viewerEmail} canModerate={canModerate} />}
      </aside>
    </div>
  );
}

function Comments({
  taskId,
  team,
  viewerEmail,
  canModerate,
}: {
  taskId: string;
  team: TeamMember[];
  viewerEmail: string;
  canModerate: boolean;
}) {
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const teamByEmail = new Map(team.map((m) => [m.email, m]));

  useEffect(() => {
    let cancelled = false;
    loadCommentsAction(taskId).then((list) => !cancelled && setComments(list));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const apply = (result: TaskComment[] | string) => {
    if (typeof result === "string") setError(result);
    else {
      setComments(result);
      setError(null);
    }
  };

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await addCommentAction(taskId, body);
      apply(result);
      if (typeof result !== "string") setDraft("");
    });
  };

  return (
    <section className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
      <p className="section-kicker">Комментарии{comments?.length ? ` · ${comments.length}` : ""}</p>

      {comments === null ? (
        <div className="h-14 animate-pulse rounded-[16px] bg-muted" />
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет комментариев.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const member = teamByEmail.get(c.authorEmail);
            const label = c.authorName ?? memberLabel(member, c.authorEmail);
            const canDelete = c.authorEmail === viewerEmail || canModerate;
            return (
              <li key={c.id} className="flex gap-2.5">
                <Avatar member={member} label={label} size="md" />
                <div className="min-w-0 flex-1 rounded-[16px] bg-muted px-3.5 py-2.5">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold">{label}</span>
                    <span className="text-muted-foreground tabular-nums">{commentTime.format(new Date(c.createdAt))}</span>
                    {canDelete && (
                      <button
                        type="button"
                        className="ml-auto text-muted-foreground hover:text-negative"
                        disabled={pending}
                        onClick={() => startTransition(async () => apply(await deleteCommentAction(c.id)))}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          rows={3}
          placeholder="Написать комментарий… (⌘ + Enter — отправить)"
          className="field resize-y"
          aria-label="Новый комментарий"
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-negative">
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn-ghost self-start border border-border text-foreground"
          disabled={pending || !draft.trim()}
          onClick={send}
        >
          {pending ? "Отправляю…" : "Отправить"}
        </button>
      </div>
    </section>
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
