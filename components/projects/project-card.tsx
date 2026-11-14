import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { ProjectWithStats } from "@/lib/domain/types";
import { FOCUS, formatImpact } from "@/lib/log/focus";
import type { ProjectAttention } from "@/lib/projects/health";
import { HealthBadge } from "./health-badge";
import { PlanFact } from "./plan-fact";
import { SourceChips } from "./source-chips";

export function ProjectCard({ project, attention }: { project: ProjectWithStats; attention?: ProjectAttention }) {
  const { stats } = project;
  const focus = attention?.focus.slice(0, 3) ?? [];

  return (
    <Link href={`/projects/${project.id}`} className="group block">
      <Card className="flex h-full flex-col transition-transform duration-200 group-hover:scale-[1.015]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{project.name}</h3>
          {attention && <HealthBadge health={attention.health} />}
        </div>
        <div className="flex flex-col gap-5">
          {stats.results.length > 0 ? (
            stats.results.map((result) => (
              <PlanFact key={result.kpi.metric} result={result} elapsed={stats.elapsed} currency={project.agent.currency} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Результаты и KPI не заданы — заполните во «Вводных».</p>
          )}
        </div>

        {attention && (
          <div className="mt-4 rounded-[16px] border border-border bg-background/60 px-3 py-2.5">
            <p className="section-kicker">Куда дать внимание</p>
            {focus.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Сейчас ничего не ждёт вашего решения.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {focus.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-xs leading-5">
                    {item.focus && (
                      <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-px text-[11px] font-semibold leading-4", FOCUS[item.focus].className)}>
                        {FOCUS[item.focus].label}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 font-medium">
                      {item.title}
                      {item.impact !== null && (
                        <span className="font-normal text-muted-foreground tabular-nums"> · ≈ {formatImpact(item.impact, project.agent.currency)} / нед.</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(attention.focus.length > 3) && <p className="mt-1 text-[11px] text-muted-foreground">и ещё {attention.focus.length - 3} — в логе проекта</p>}
          </div>
        )}

        <SourceChips sources={project.sources} className="mt-auto pt-4" />
      </Card>
    </Link>
  );
}
