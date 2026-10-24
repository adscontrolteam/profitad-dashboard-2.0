import type { Metadata } from "next";
import { TaskArchive } from "@/components/tasks/task-archive";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskSummaryTiles } from "@/components/tasks/task-summary";
import { TaskViewTabs } from "@/components/tasks/task-view-tabs";
import type { TaskProject } from "@/components/tasks/types";
import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { getVisibleProjects } from "@/lib/data";
import { summarizeTasks } from "@/lib/tasks/stages";
import { listTasks } from "@/lib/tasks/store";
import { listTeam } from "@/lib/tasks/team";

export const metadata: Metadata = { title: "Task Manager" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { view } = await searchParams;
  const archived = view === "archive";
  const viewer = await requireSection("tasks");
  const { permissions } = viewer;

  const [allTasks, projects, team] = await Promise.all([
    listTasks({ archived }),
    getVisibleProjects(permissions),
    listTeam(),
  ]);
  const tasks = allTasks.filter((t) => t.projectId === null || canViewProject(permissions, t.projectId));
  const today = new Date().toISOString().slice(0, 10);
  const projectOptions: TaskProject[] = projects.map(({ id, name, status }) => ({
    id,
    name,
    archived: status === "archived",
  }));

  return (
    <div className="flex min-h-0 flex-col gap-5">
      {!archived && <TaskSummaryTiles summary={summarizeTasks(tasks, today, viewer.email)} />}
      <TaskViewTabs archived={archived} />
      {archived ? (
        <TaskArchive tasks={tasks} projects={projectOptions} team={team} />
      ) : (
        <TaskBoard
          key="board"
          tasks={tasks}
          projects={projectOptions}
          team={team}
          today={today}
          viewerEmail={viewer.email}
          canModerate={permissions.canManageAccess}
        />
      )}
    </div>
  );
}
