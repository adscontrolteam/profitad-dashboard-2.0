import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricsGrid } from "@/components/projects/metrics-grid";
import { ProjectFunnel } from "@/components/projects/project-funnel";
import { AutoRefresh } from "@/components/projects/auto-refresh";
import { LogFocus } from "@/components/log/log-focus";
import { ProjectAsk } from "@/components/projects/project-ask";
import { askConfigured, chatUsage, listChat } from "@/lib/ai/ask";
import { listLog } from "@/lib/log/store";
import { toLogItems } from "@/lib/log/view";
import { ProjectPeriodControl } from "@/components/projects/project-period-control";
import { currentMonth, monthEnd, monthOf, monthsBetween, planFor } from "@/lib/projects/plans";
import { parseProjectPeriod } from "@/lib/projects/range";
import { firstDataDate } from "@/lib/integrations/store";
import { first } from "@/lib/workspace/params";
import { HealthBadge } from "@/components/projects/health-badge";
import { projectsAttention } from "@/lib/projects/health";
import { ResultCard } from "@/components/projects/result-card";
import { WeekPlanCard, type WeekColumn, type WeekRow } from "@/components/projects/week-plan";
import { listWeekOverrides } from "@/lib/projects/week-store";
import { monthSegments, weekPlan, weekStartOf, type WeekMetric } from "@/lib/projects/weeks";
import { METRICS } from "@/lib/domain/metrics";
import type { ProjectWithStats } from "@/lib/domain/types";
import { SourceChips } from "@/components/projects/source-chips";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { canViewProject, canViewSection } from "@/lib/access/policy";
import { getViewerState, requireProject } from "@/lib/access/viewer";
import { getProject, getProjects, getVisibleProjects } from "@/lib/data";
import { ProjectMobileNav } from "@/components/projects/project-mobile-nav";
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

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const query = await searchParams;
  const { permissions } = await requireProject(projectId);
  const base = await getProject(projectId);
  if (!base) notFound();
  const firstData = await firstDataDate(projectId);
  const since = firstData && firstData < base.startDate ? firstData : base.startDate;
  const period = parseProjectPeriod(first(query.range), first(query.from), first(query.to), since);
  const project = (await getProject(projectId, period.from, period.to)) ?? base;
  const { stats } = project;
  // Monthly plan of leads for the history table (a month without its own plan keeps the previous one).
  const fallback = base.plans.length ? null : { kpis: base.kpis, budgetMonth: base.agent.budgetMonth };
  const leadPlans = Object.fromEntries(
    monthsBetween(period.from, period.to).map((m) => [
      m,
      planFor(base.plans, m, monthOf(base.startDate), fallback)?.kpis.find((k) => k.metric === "leads")?.plan ?? null,
    ]),
  );

  // History follows the period: an entry is shown if it was open at any moment inside it.
  const periodStart = Date.parse(`${period.from}T00:00:00Z`);
  const periodEnd = Date.parse(`${period.to}T23:59:59Z`);
  // A result with neither a plan nor a fact in this period is an empty card: keep the main one only.
  const withNumbers = stats.results.filter((r) => r.kpi.plan !== null || r.fact > 0);
  const results = withNumbers.length ? withNumbers : stats.results.slice(0, 1);
  const logItems = toLogItems(
    (await listLog(project.id, undefined, 500)).filter((l) => {
      if (l.createdAt.getTime() > periodEnd) return false;
      // Still open = alive up to now, so it belongs to every period since it appeared.
      return l.status === "needs_you" || (l.resolvedAt ?? l.updatedAt).getTime() >= periodStart;
    }),
  );
  // Weeks make sense for one month at a time.
  const weekMonth = monthOf(period.from) === monthOf(period.to) ? monthOf(period.from) : null;

  return (
    <div className="flex flex-col gap-5">
      <ProjectMobileNav
        projects={(await getVisibleProjects(permissions)).filter((p) => p.status !== "archived")}
        projectId={project.id}
        area={null}
        permissions={permissions}
      />
      <div className="flex flex-wrap items-center gap-3 px-1">
        <StatusBadge status={project.status} />
        {base.status === "active" && <ProjectHealthBadge base={base} />}
        <span className="text-sm text-muted-foreground">в работе с {formatDate(project.startDate)}</span>
        <SourceChips sources={project.sources} />
        <ProjectOwnersLine owners={project.owners} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProjectPeriodControl path={`/projects/${project.id}`} period={period} maxDate={monthEnd(currentMonth())} />
        <span className="text-xs text-muted-foreground">
          {formatDate(project.period.start)} — {formatDate(project.period.end)}
          {project.planCarried && " · план с прошлого месяца — задайте новый во «Вводных»"}
        </span>
      </div>

      {project.goal && (
        <Card className="py-4 sm:py-4 lg:py-4">
          <p className="section-kicker">Основная цель</p>
          <p className="mt-1 text-base font-semibold tracking-[-0.02em]">{project.goal}</p>
        </Card>
      )}

      {/* Plan / fact on the left, the month week by week next to it. */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {period.to < base.startDate ? (
            <Card>
              <h2 className="section-title">{weekMonth ? "План месяца" : "План периода"}</h2>
              <p className="mt-3 font-display text-2xl font-extrabold text-muted-foreground">—</p>
              <p className="mt-1 text-sm text-muted-foreground">В этом периоде проект ещё не был в работе: старт {formatDate(base.startDate)}.</p>
            </Card>
          ) : results.length > 0 ? (
            results.map((result, i) => (
              <ResultCard
                key={result.kpi.metric}
                result={result}
                elapsed={stats.elapsed}
                currency={project.agent.currency}
                title={i > 0 ? undefined : weekMonth ? "План месяца" : "План периода"}
              />
            ))
          ) : (
            <Card>
              <p className="text-sm text-muted-foreground">Результаты и KPI не заданы — заполните во «Вводных».</p>
            </Card>
          )}
        </div>
        <WeekPlanSection base={base} month={weekMonth} canEdit={permissions.canEditInputs} />
      </section>

      <LogFocus projectId={project.id} items={logItems} currency={project.agent.currency} />

      <MetricsGrid metrics={project.metrics} currency={project.agent.currency} />

      <AutoRefresh projectId={project.id} />
      <ProjectFunnel
        projectId={project.id}
        currency={project.agent.currency}
        from={period.from}
        to={period.to}
        periodLabel={period.label}
        leadPlans={leadPlans}
        allFromAds={project.agent.leadsAllFromAds}
      />

      <ProjectAsk
        projectId={project.id}
        projectName={project.name}
        initial={await listChat(project.id)}
        usage={await chatUsage(project.id)}
        ready={askConfigured()}
      />


    </div>
  );
}

const SHORT_MONTHS = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
const FULL_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** The current month week by week: plan (split of the month's plan or a manual number) against the fact so far. */
async function WeekPlanSection({ base, month, canEdit }: { base: ProjectWithStats; month: string | null; canEdit: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  // Several months at once: no weekly table, just a dash.
  if (!month) return <WeekPlanCard projectId={base.id} monthLabel="" columns={[]} rows={[]} currency={base.agent.currency} canEdit={false} empty="range" />;
  const fallback = base.plans.length ? null : { kpis: base.kpis, budgetMonth: base.agent.budgetMonth };
  const overrides = await listWeekOverrides(base.id);
  const thisWeek = weekStartOf(today);

  // Weeks of this month only, 1st to last day; an edge piece under four days joins its neighbour (1–8, 23–30).
  const rows: WeekRow[] = await Promise.all(
    monthSegments(month).map(async ({ from, to, days, weeks }) => {
      const state = today > to ? "past" : today < from ? "future" : "current";
      const fact = state === "future" ? null : await getProject(base.id, from, to < today ? to : today);
      const cells: WeekRow["cells"] = {};
      for (const weekStart of weeks) {
        const plan = weekPlan(base.plans, overrides, weekStart, monthOf(base.startDate), fallback, thisWeek, { from, to });
        for (const [metric, value] of Object.entries(plan)) {
          if (!value) continue;
          const sum = (cells[metric]?.plan ?? 0) + value.plan;
          cells[metric] = {
            plan: Math.round(sum * 100) / 100,
            manual: (cells[metric]?.manual ?? false) || value.manual,
            fact: fact ? (fact.metrics[metric as WeekMetric] ?? 0) : null,
          };
        }
      }
      return {
        id: from,
        weeks,
        label: `${Number(from.slice(8, 10))}–${dayLabel(to)}`,
        state,
        days,
        daysPassed: state === "past" ? days : state === "future" ? 0 : Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000),
        cells,
      };
    }),
  );

  const metrics = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))] as WeekMetric[];
  const columns: WeekColumn[] = metrics
    .sort((a, b) => Number(a === "spend") - Number(b === "spend"))
    .map((metric) => ({
      metric,
      label: metric === "spend" ? "Бюджет" : METRICS[metric].label,
      money: METRICS[metric].format === "currency",
      isBudget: metric === "spend",
    }));

  return (
    <WeekPlanCard
      projectId={base.id}
      monthLabel={`${FULL_MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`}
      columns={columns}
      rows={rows}
      currency={base.agent.currency}
      canEdit={canEdit}
      empty={monthOf(base.startDate) > month ? "before" : "plan"}
    />
  );
}

/** The same score as on the dashboard card; always for the current month, whatever period the page shows. */
async function ProjectHealthBadge({ base }: { base: ProjectWithStats }) {
  const attention = (await projectsAttention([base])).get(base.id);
  return attention ? <HealthBadge health={attention.health} /> : null;
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
