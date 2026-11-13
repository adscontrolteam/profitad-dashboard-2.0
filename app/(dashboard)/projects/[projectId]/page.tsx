import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricsGrid } from "@/components/projects/metrics-grid";
import { ResultCard } from "@/components/projects/result-card";
import { SourceChips } from "@/components/projects/source-chips";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { canViewProject, canViewSection } from "@/lib/access/policy";
import { getViewerState, requireProject } from "@/lib/access/viewer";
import { getProject, getProjects } from "@/lib/data";
import { formatDate } from "@/lib/format";

export async function generateStaticParams() {
  const projects = await getProjects();
  // Cache Components requires at least one param; unknown ids resolve to 404 at runtime.
  return projects.length ? projects.map((p) => ({ projectId: p.id })) : [{ projectId: "_" }];
}

export async function generateMetadata({
  params,
}: PageProps<"/analysis/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  const state = await getViewerState();
  const allowed =
    state.status === "ok" &&
    canViewSection(state.viewer.permissions, "analysis") &&
    canViewProject(state.viewer.permissions, projectId);
  const project = allowed ? await getProject(projectId) : null;
  return { title: project?.name ?? "Проект" };
}

export default async function ProjectPage({ params }: PageProps<"/analysis/[projectId]">) {
  const { projectId } = await params;
  await requireProject(projectId);
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
    </div>
  );
}
