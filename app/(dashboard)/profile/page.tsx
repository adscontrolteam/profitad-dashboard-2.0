import type { Metadata } from "next";
import Link from "next/link";
import { LocalClock } from "@/components/profile/local-clock";
import { ProjectCard } from "@/components/projects/project-card";
import { TaskBoard } from "@/components/tasks/task-board";
import type { TaskProject } from "@/components/tasks/types";
import { initials } from "@/components/tasks/types";
import { Card } from "@/components/ui/card";
import { canViewProject, canViewSection } from "@/lib/access/policy";
import { ROLE_META } from "@/lib/access/roles";
import { requireViewer } from "@/lib/access/viewer";
import { getVisibleProjects } from "@/lib/data";
import { listTasks } from "@/lib/tasks/store";
import { listTeam } from "@/lib/tasks/team";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const { permissions } = viewer;
  const showTasks = canViewSection(permissions, "tasks");
  const showProjects = canViewSection(permissions, "dashboard");

  const [allTasks, projects, team] = await Promise.all([
    showTasks ? listTasks({ archived: false }) : Promise.resolve([]),
    getVisibleProjects(permissions),
    showTasks ? listTeam() : Promise.resolve([]),
  ]);

  const myTasks = allTasks.filter(
    (t) => t.assigneeEmail === viewer.email && (t.projectId === null || canViewProject(permissions, t.projectId)),
  );

  // «Мои проекты»: where the person is responsible (SMM / MediaBuyer) or has open tasks;
  // for someone limited to selected projects, those projects.
  const myProjectIds = new Set([
    ...projects.filter((p) => p.owners.smm === viewer.email || p.owners.mediaBuyer === viewer.email).map((p) => p.id),
    ...(permissions.projects === "all"
      ? myTasks.filter((t) => t.stage !== "done" && t.projectId).map((t) => t.projectId as string)
      : permissions.projects),
  ]);
  const myProjects = projects.filter((p) => p.status === "active" && myProjectIds.has(p.id));

  const today = new Date().toISOString().slice(0, 10);
  const projectOptions: TaskProject[] = projects.map(({ id, name, status }) => ({
    id,
    name,
    archived: status === "archived",
  }));

  const firstName = viewer.name?.split(/\s+/)[0] ?? viewer.email.split("@")[0];

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center gap-4 sm:gap-5">
        {viewer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Clerk avatar, already sized by Clerk's CDN
          <img src={viewer.imageUrl} alt="" className="size-14 shrink-0 rounded-full object-cover sm:size-20" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-bold sm:size-20">
            {initials(viewer.name ?? viewer.email)}
          </span>
        )}
        <div className="min-w-0 flex-1 basis-[calc(100%-4.5rem)] sm:basis-auto">
          <h2 className="text-2xl font-bold tracking-[-0.03em] sm:text-[28px]">Привет, {firstName}!</h2>
          <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {ROLE_META[permissions.role].label} · {viewer.email}
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <LocalClock />
        </div>
      </Card>

      {showProjects && (
        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <Link href="/" className="group">
              <h2 className="section-title group-hover:underline">Твои проекты в работе →</h2>
            </Link>
            <p className="text-xs text-muted-foreground">
              {permissions.projects === "all"
                ? "Активные проекты, где ты ответственный или у тебя есть открытые задачи"
                : "Проекты, к которым у тебя доступ"}
            </p>
          </div>
          {myProjects.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:gap-5 2xl:grid-cols-3">
              {myProjects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Пока нет активных проектов, где ты ответственный или у тебя есть задачи.
            </p>
          )}
        </Card>
      )}

      {showTasks && (
        <Card className="min-w-0">
          <Link href="/tasks" className="group mb-4 block w-fit">
            <h2 className="section-title group-hover:underline">Твои задачи →</h2>
          </Link>
          <TaskBoard
            key="profile-board"
            tasks={myTasks}
            projects={projectOptions}
            team={team}
            today={today}
            viewerEmail={viewer.email}
            canModerate={permissions.canManageAccess}
            personal
          />
        </Card>
      )}
    </div>
  );
}
