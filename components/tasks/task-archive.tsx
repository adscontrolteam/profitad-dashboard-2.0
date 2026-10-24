"use client";

import { useDeferredValue, useOptimistic, useState, useTransition } from "react";
import { restoreTasksAction } from "@/app/(dashboard)/tasks/actions";
import { Card } from "@/components/ui/card";
import { TONE_DOT } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { TASK_STAGE_META, type Task, type TeamMember } from "@/lib/tasks/stages";
import { Checkbox } from "./checkbox";
import { memberLabel, type TaskProject } from "./types";

export function TaskArchive({
  tasks,
  projects,
  team,
}: {
  tasks: Task[];
  projects: TaskProject[];
  team: TeamMember[];
}) {
  const [optimisticTasks, removeRestored] = useOptimistic(tasks, (state, ids: string[]) =>
    state.filter((t) => !ids.includes(t.id)),
  );
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const teamByEmail = new Map(team.map((m) => [m.email, m]));

  const visible = deferredQuery
    ? optimisticTasks.filter((t) =>
        [t.title, t.description, t.projectId ? projectsById.get(t.projectId)?.name ?? "" : ""].some((v) =>
          v.toLowerCase().includes(deferredQuery),
        ),
      )
    : optimisticTasks;

  const ids = visible.map((t) => t.id);
  const selectedIds = ids.filter((id) => selected.has(id));
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;

  const toggle = (list: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of list) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const restore = () => {
    const list = selectedIds;
    if (list.length === 0) return;
    setSelected(new Set());
    startTransition(async () => {
      removeRestored(list);
      await restoreTasksAction(list);
    });
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="section-title">Архив задач</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Сюда попадают задачи, отправленные в архив вручную, и задачи проектов, ушедших в архив.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск в архиве"
          className="field max-w-xs sm:ml-auto"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[16px] bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          {optimisticTasks.length === 0 ? "Архив пуст." : "Ничего не найдено."}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-1">
            <Checkbox checked={allSelected} onChange={(on) => toggle(ids, on)} label="Выделить все" />
            <span className="text-sm text-muted-foreground tabular-nums">
              {selectedIds.length ? `Выбрано: ${selectedIds.length}` : `Задач: ${visible.length}`}
            </span>
            <button
              type="button"
              className="btn-primary ml-auto"
              disabled={pending || selectedIds.length === 0}
              onClick={restore}
            >
              Вернуть на доску
            </button>
          </div>

          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-[16px] border border-border">
            {visible.map((task) => {
              const project = task.projectId ? projectsById.get(task.projectId) : undefined;
              const meta = TASK_STAGE_META[task.stage];
              const assignee = task.assigneeEmail
                ? memberLabel(teamByEmail.get(task.assigneeEmail), task.assigneeEmail)
                : "Не назначен";
              return (
                <li
                  key={task.id}
                  className={cn("flex items-start gap-3 px-3 py-3 sm:px-4", selected.has(task.id) && "bg-muted/60")}
                >
                  <Checkbox
                    checked={selected.has(task.id)}
                    onChange={(on) => toggle([task.id], on)}
                    label={`Выделить «${task.title}»`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{task.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn("size-1.5 rounded-full", TONE_DOT[meta.tone])} aria-hidden />
                        {meta.label}
                      </span>
                      <span>· {project?.name ?? "Без проекта"}</span>
                      <span>· {assignee}</span>
                      {task.deadline && <span>· до {formatDate(task.deadline)}</span>}
                    </p>
                  </div>
                  {task.archivedAt && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums" title={task.archivedBy ?? ""}>
                      {formatDate(task.archivedAt)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
