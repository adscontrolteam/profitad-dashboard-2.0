import "server-only";
import type { ProjectLogRow } from "@/db/schema";
import { getProject } from "@/lib/data";
import { projectHealth, type Health } from "@/lib/domain/health";
import type { ProjectWithStats } from "@/lib/domain/types";
import { byImpact } from "@/lib/log/focus";
import { listFocus } from "@/lib/log/store";
import { monthOf } from "./plans";
import { listWeekOverrides } from "./week-store";
import { addDays, weekElapsed, weekPlan, weekStartOf } from "./weeks";

export interface ProjectAttention {
  health: Health;
  /** Open «Фокус» entries of the project, the costliest first. */
  focus: ProjectLogRow[];
}

/** Health score and focus list of each project (given with its current-month stats). */
export async function projectsAttention(projects: ProjectWithStats[]): Promise<Map<string, ProjectAttention>> {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf(today);
  const elapsed = weekElapsed(weekStart, today);
  const allFocus = await listFocus(projects.map((p) => p.id), 200);

  const entries = await Promise.all(
    projects.map(async (p) => {
      const focus = byImpact(allFocus.filter((f) => f.projectId === p.id));
      const metric = p.stats.primary?.kpi.metric;
      const [recent, week, overrides] = await Promise.all([
        getProject(p.id, addDays(today, -7), addDays(today, -1)),
        // Whole days of the week so far; on Monday there is nothing to judge yet.
        elapsed > 0 ? getProject(p.id, weekStart, addDays(today, -1)) : null,
        listWeekOverrides(p.id),
      ]);
      const fallback = p.plans.length ? null : { kpis: p.kpis, budgetMonth: p.agent.budgetMonth };
      const target = metric ? weekPlan(p.plans, overrides, weekStart, monthOf(p.startDate), fallback)[metric]?.plan : undefined;
      const expected = target ? target * elapsed : 0;
      const health = projectHealth({
        elapsed: p.stats.elapsed,
        fact: p.stats.primary?.fact ?? 0,
        plan: p.stats.primary?.kpi.plan ?? null,
        pace: p.stats.primary?.pace ?? null,
        cpaFact: p.stats.primary?.cpaFact ?? null,
        cpaPlan: p.stats.primary?.kpi.cpaPlan ?? null,
        spend: p.metrics.spend ?? 0,
        week: metric && week && expected >= 1 ? { fact: week.metrics[metric] ?? 0, expected } : null,
        recent: { results: metric ? (recent?.metrics[metric] ?? 0) : 0, spend: recent?.metrics.spend ?? 0 },
        issues: focus.flatMap((f) => (f.focus ? [{ focus: f.focus }] : [])),
      });
      return [p.id, { health, focus }] as const;
    }),
  );
  return new Map(entries);
}
