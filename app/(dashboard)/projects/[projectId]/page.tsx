import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricsGrid } from "@/components/projects/metrics-grid";
import { ProjectLeads } from "@/components/projects/project-leads";
import { ResultCard } from "@/components/projects/result-card";
import { SourceChips } from "@/components/projects/source-chips";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { canViewProject, canViewSection } from "@/lib/access/policy";
import { getViewerState, requireProject } from "@/lib/access/viewer";
import { getProject, getProjects } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { ProjectOwners } from "@/lib/domain/types";
import { memberLabel } from "@/components/tasks/types";
import { listTeam } from "@/lib/tasks/team";

export async function generateStaticParams() {
  const projects = await getProjects();
  // Cache Components requires at least one param; unknown ids resolve to 404 at runtime.
  return projects.length ? projects.map((p) => ({ projectId: p.id })) : [{ projectId: "_" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  const state = await getViewerState();
  const allowed =
    state.status === "ok" &&
    canViewSection(state.viewer.permissions, "dashboard") &&
    canViewProject(state.viewer.permissions, projectId);
  const project = allowed ? await getProject(projectId) : null;
  return { title: project?.name ?? "Проект" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const { permissions } = await requireProject(projectId);
  const project = await getProject(projectId);
  if (!project) notFound();
  const { stats } = project;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <StatusBadge status={project.status} />
        <span className="text-sm text-muted-foreground">
          {formatDate(project.period.start)} — {formatDate(project.period.end)}
        </span>
        <SourceChips sources={project.sources} />
        <ProjectOwnersLine owners={project.owners} />
        <div className="ml-auto flex flex-wrap gap-2">
          {canViewSection(permissions, "ads") && (
            <Link href={`/ads?p=${project.id}`} className="btn-ghost border border-border px-3 py-1.5">
              Реклама →
            </Link>
          )}
          {canViewSection(permissions, "smm") && (
            <Link href={`/smm?p=${project.id}`} className="btn-ghost border border-border px-3 py-1.5">
              SMM →
            </Link>
          )}
        </div>
      </div>

      {project.goal && (
        <Card className="py-4 sm:py-4 lg:py-4">
          <p className="section-kicker">Основная цель</p>
          <p className="mt-1 text-base font-semibold tracking-[-0.02em]">{project.goal}</p>
        </Card>
      )}

      {stats.results.length > 0 ? (
        <section className="grid gap-5 lg:grid-cols-2">
          {stats.results.map((result) => (
            <ResultCard key={result.kpi.metric} result={result} elapsed={stats.elapsed} />
          ))}
        </section>
      ) : (
        <Card>
          <p className="text-sm text-muted-foreground">Результаты и KPI не заданы — заполните во «Вводных».</p>
        </Card>
      )}

      <MetricsGrid metrics={project.metrics} />

      <ProjectLeads projectId={project.id} />
    </div>
  );
}

async function ProjectOwnersLine({ owners }: { owners: ProjectOwners }) {
  if (!owners.smm && !owners.mediaBuyer) return null;
  const team = await listTeam();
  const name = (email: string | null) => {
    if (!email) return "—";
    const member = team.find((m) => m.email === email);
    return memberLabel(member, email);
  };
  return (
    <span className="text-sm text-muted-foreground">
      SMM: <span className="font-medium text-foreground">{name(owners.smm)}</span> · MediaBuyer:{" "}
      <span className="font-medium text-foreground">{name(owners.mediaBuyer)}</span>
    </span>
  );
}
