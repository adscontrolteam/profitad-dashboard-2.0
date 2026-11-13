import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Delta } from "@/components/ui/signal";
import type { ProjectWithStats } from "@/lib/domain/types";
import { PlanFact } from "./plan-fact";
import { SourceChips } from "./source-chips";

export function ProjectCard({ project }: { project: ProjectWithStats }) {
  const { stats } = project;
  const pace = stats.primary?.pace ?? null;

  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <Card className="h-full transition-transform duration-200 group-hover:scale-[1.015]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{project.name}</h3>
          {pace !== null && <Delta value={pace - 1} suffix="к плану" />}
        </div>
        <div className="flex flex-col gap-5">
          {stats.results.length > 0 ? (
            stats.results.map((result) => (
              <PlanFact key={result.kpi.metric} result={result} elapsed={stats.elapsed} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Результаты и KPI не заданы — заполните во «Вводных».</p>
          )}
        </div>
        <SourceChips sources={project.sources} className="mt-4" />
      </Card>
    </Link>
  );
}
