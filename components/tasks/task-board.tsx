"use client";

import { useDeferredValue, useOptimistic, useState, useTransition } from "react";
import { archiveTasksAction, moveTaskAction } from "@/app/(dashboard)/tasks/actions";
import { TONE_DOT } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { isOverdue, TASK_STAGE_META, TASK_STAGES, type Task, type TaskStage, type TeamMember } from "@/lib/tasks/stages";
import { Checkbox } from "./checkbox";
import { TaskDrawer } from "./task-drawer";
import { initials, memberLabel, type TaskProject } from "./types";

type Move = { id: string; stage: TaskStage; position: number };
type DropTarget = { stage: TaskStage; beforeId: string | null };

const ALL = "";
const NONE = "__none";

function positionFor(column: Task[], beforeId: string | null) {
  if (column.length === 0) return 1;
  const index = beforeId ? column.findIndex((t) => t.id === beforeId) : -1;
  if (index === -1) return column[column.length - 1].position + 1;
  if (index === 0) return column[0].position - 1;
  return (column[index - 1].position + column[index].position) / 2;
}

export function TaskBoard({
  tasks,
  projects,
  team,
  today,
  viewerEmail,
  canModerate,
}: {
  tasks: Task[];
  projects: TaskProject[];
  team: TeamMember[];
  today: string;
  viewerEmail: string;
  canModerate: boolean;
}) {
  const [optimisticTasks, applyChange] = useOptimistic(
    tasks,
    (state, change: Move | { archive: string[] }) =>
      "archive" in change
        ? state.filter((t) => !change.archive.includes(t.id))
        : state.map((t) => (t.id === change.id ? { ...t, stage: change.stage, position: change.position } : t)),
  );
  const [archiving, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [projectFilter, setProjectFilter] = useState(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [drawer, setDrawer] = useState<{ task: Task | null; stage: TaskStage } | null>(null);

  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const teamByEmail = new Map(team.map((m) => [m.email, m]));

  const visible = optimisticTasks.filter((t) => {
    if (projectFilter === NONE ? t.projectId !== null : projectFilter && t.projectId !== projectFilter) return false;
    if (assigneeFilter === NONE ? t.assigneeEmail !== null : assigneeFilter && t.assigneeEmail !== assigneeFilter)
      return false;
    if (!deferredQuery) return true;
    const project = t.projectId ? projectsById.get(t.projectId)?.name ?? "" : "";
    return [t.title, t.description, project].some((v) => v.toLowerCase().includes(deferredQuery));
  });

  const columns = TASK_STAGES.map((stage) => ({
    stage,
    tasks: visible.filter((t) => t.stage === stage).sort((a, b) => a.position - b.position),
  }));

  const selectedIds = [...selected].filter((id) => optimisticTasks.some((t) => t.id === id));

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const archiveSelected = () => {
    if (selectedIds.length === 0) return;
    const ids = selectedIds;
    setSelected(new Set());
    startTransition(async () => {
      applyChange({ archive: ids });
      await archiveTasksAction(ids);
    });
  };

  const drop = (target: DropTarget) => {
    const id = dragId;
    setDragId(null);
    setDropTarget(null);
    if (!id || id === target.beforeId) return;

    const column = optimisticTasks
      .filter((t) => t.stage === target.stage && t.id !== id)
      .sort((a, b) => a.position - b.position);
    const move = { id, stage: target.stage, position: positionFor(column, target.beforeId) };

    startTransition(async () => {
      applyChange(move);
      await moveTaskAction(move.id, move.stage, move.position);
    });
  };

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по задачам"
          className="field max-w-xs"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="field w-auto max-w-[200px]"
          aria-label="Проект"
        >
          <option value={ALL}>Все проекты</option>
          <option value={NONE}>Без проекта</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archived ? " (архив)" : ""}
            </option>
          ))}
        </select>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="field w-auto max-w-[200px]"
          aria-label="Исполнитель"
        >
          <option value={ALL}>Все исполнители</option>
          <option value={viewerEmail}>Мои задачи</option>
          <option value={NONE}>Без исполнителя</option>
          {team
            .filter((m) => m.email !== viewerEmail)
            .map((m) => (
              <option key={m.email} value={m.email}>
                {memberLabel(m, m.email)}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="btn-primary ml-auto"
          onClick={() => setDrawer({ task: null, stage: "backlog" })}
        >
          Новая задача
        </button>
      </div>

      <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0">
        {columns.map(({ stage, tasks: columnTasks }) => {
          const meta = TASK_STAGE_META[stage];
          const isTarget = dropTarget?.stage === stage;
          const ids = columnTasks.map((t) => t.id);
          const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

          return (
            <div
              key={stage}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (!isTarget || dropTarget.beforeId !== null) setDropTarget({ stage, beforeId: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(dropTarget?.stage === stage ? dropTarget : { stage, beforeId: null });
              }}
              className={cn(
                "group/column flex w-[284px] shrink-0 snap-start flex-col rounded-[24px] border border-border bg-muted/50 p-2 transition-colors",
                isTarget && "border-ring/40 bg-muted",
              )}
            >
              <header className="flex items-center gap-2 px-2 pt-1.5 pb-2.5">
                <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[meta.tone])} aria-hidden />
                <h3 className="min-w-0 truncate text-sm font-semibold tracking-[-0.02em]">{meta.label}</h3>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {columnTasks.length}
                </span>
                {ids.length > 0 && (
                  <Checkbox
                    checked={allSelected}
                    onChange={(on) => toggle(ids, on)}
                    label={`Выделить все в «${meta.label}»`}
                    className={cn(
                      "ml-auto",
                      selected.size === 0 && "opacity-0 group-hover/column:opacity-100 focus-visible:opacity-100",
                    )}
                  />
                )}
              </header>

              <ul className="flex min-h-16 flex-col gap-2">
                {columnTasks.map((task) => (
                  <li
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", task.id);
                      setDragId(task.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropTarget(null);
                    }}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (dropTarget?.beforeId !== task.id) setDropTarget({ stage, beforeId: task.id });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      drop({ stage, beforeId: task.id });
                    }}
                    className={cn(
                      "relative",
                      dropTarget?.beforeId === task.id &&
                        "before:absolute before:inset-x-2 before:-top-1.5 before:h-0.5 before:rounded-full before:bg-ring",
                    )}
                  >
                    <TaskCard
                      task={task}
                      project={task.projectId ? projectsById.get(task.projectId) : undefined}
                      assignee={task.assigneeEmail ? teamByEmail.get(task.assigneeEmail) : undefined}
                      today={today}
                      dragging={dragId === task.id}
                      selected={selected.has(task.id)}
                      selecting={selected.size > 0}
                      onSelect={(on) => toggle([task.id], on)}
                      onOpen={() => setDrawer({ task, stage: task.stage })}
                    />
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="btn-ghost mt-2 w-full justify-start px-3 py-2 text-xs"
                onClick={() => setDrawer({ task: null, stage })}
              >
                + Добавить
              </button>
            </div>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 lg:bottom-6">
          <div
            role="toolbar"
            aria-label="Действия с выбранными задачами"
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-4 shadow-[var(--shadow)]"
          >
            <span className="text-sm font-semibold tabular-nums">Выбрано: {selectedIds.length}</span>
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setSelected(new Set())}>
              Снять
            </button>
            <button type="button" className="btn-primary" disabled={archiving} onClick={archiveSelected}>
              В архив
            </button>
          </div>
        </div>
      )}

      {drawer && (
        <TaskDrawer
          key={drawer.task?.id ?? `new:${drawer.stage}`}
          task={drawer.task}
          defaultStage={drawer.stage}
          projects={projects}
          team={team}
          viewerEmail={viewerEmail}
          canModerate={canModerate}
          onClose={() => setDrawer(null)}
        />
      )}
    </section>
  );
}

function TaskCard({
  task,
  project,
  assignee,
  today,
  dragging,
  selected,
  selecting,
  onSelect,
  onOpen,
}: {
  task: Task;
  project: TaskProject | undefined;
  assignee: TeamMember | undefined;
  today: string;
  dragging: boolean;
  selected: boolean;
  selecting: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
}) {
  const overdue = isOverdue(task, today);
  const label = task.assigneeEmail ? memberLabel(assignee, task.assigneeEmail) : null;

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-grab flex-col gap-2 rounded-[16px] border border-border bg-card p-3 text-left shadow-[var(--shadow)] transition-[transform,opacity,border-color] hover:-translate-y-0.5 active:cursor-grabbing",
        dragging && "opacity-40",
        selected && "border-ring",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-[16px]"
        aria-label={`Открыть задачу «${task.title}»`}
      />

      <div className="pointer-events-none flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-5 tracking-[-0.02em] [overflow-wrap:anywhere]">
          {task.title}
        </p>
        <Checkbox
          checked={selected}
          onChange={onSelect}
          label={`Выделить «${task.title}»`}
          className={cn(
            "pointer-events-auto relative z-10 -mt-0.5 -mr-0.5",
            !selecting && !selected && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        />
      </div>

      {project && (
        <p className="pointer-events-none truncate text-xs text-muted-foreground">
          {project.name}
          {project.archived ? " · архив" : ""}
        </p>
      )}

      <div className="pointer-events-none flex items-center gap-2 text-xs">
        {task.deadline && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 tabular-nums",
              overdue ? "bg-negative/12 font-semibold text-negative" : "bg-muted text-muted-foreground",
            )}
            title="Дедлайн"
          >
            до {formatDate(task.deadline)}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground tabular-nums" title="Комментарии">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
            </svg>
            {task.commentCount}
          </span>
        )}
        {label && (
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-muted-foreground" title={task.assigneeEmail ?? ""}>
            <span className="truncate">{label}</span>
            <Avatar member={assignee} label={label} />
          </span>
        )}
      </div>
    </div>
  );
}

export function Avatar({ member, label, size = "sm" }: { member: TeamMember | undefined; label: string; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "size-5 text-[9px]" : "size-7 text-[11px]";
  if (member?.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.imageUrl} alt="" className={cn("shrink-0 rounded-full object-cover", dimension)} />;
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground",
        dimension,
      )}
      aria-hidden
    >
      {initials(label)}
    </span>
  );
}
