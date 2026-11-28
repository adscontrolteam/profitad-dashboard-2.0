import { after } from "next/server";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { StatusSummary } from "@/components/dashboard/status-summary";
import { ProjectCard } from "@/components/projects/project-card";
import { InfoHint } from "@/components/ui/info-hint";
import { HEALTH_GREEN, HEALTH_YELLOW } from "@/lib/domain/health";
import { projectsAttention } from "@/lib/projects/health";
import { Placeholder } from "@/components/ui/page-header";
import { requireSection } from "@/lib/access/viewer";
import { getActiveProjects, getStatusSummary } from "@/lib/data";
import { refreshAllStale } from "@/lib/data/refresh";

export default async function DashboardPage() {
  const { permissions } = await requireSection("dashboard");
  // Opening the dashboard also starts the background refresh of all projects when the hourly one is overdue.
  after(() => refreshAllStale().then(() => undefined, (e) => console.error("refresh all", (e as Error).message)));
  const [summary, activeProjects] = await Promise.all([
    getStatusSummary(permissions),
    getActiveProjects(permissions),
  ]);
  const attention = await projectsAttention(activeProjects);
  // The projects that need attention most come first.
  const ordered = [...activeProjects].sort((a, b) => (attention.get(a.id)?.health.score ?? 101) - (attention.get(b.id)?.health.score ?? 101));

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh />
      <StatusSummary summary={summary} />

      <section>
        <div className="mb-4">
          <p className="section-kicker mb-1">Сейчас в работе</p>
          <h2 className="section-title">
            Активные проекты
            <InfoHint className="ml-2">
              <span className="block">
                Цифра в углу карточки — оценка проекта от 0 до 100: насколько он сейчас требует внимания. Зелёная ({HEALTH_GREEN}+) — результат идёт,
                горячих решений нет. Жёлтая ({HEALTH_YELLOW}–{HEALTH_GREEN - 1}) — результат просел, нужно внимание. Красная (ниже {HEALTH_YELLOW}) —
                результата нет или он далеко от плана.
              </span>
              <span className="mt-2 block">
                Из чего складывается: результат к плану месяца (вес 40), цена результата к целевой (20), эта неделя к плану недели (15), идут ли
                результаты последние 7 дней (15), открытые вопросы в фокусе (10). Если четверть месяца позади, а результатов нет, оценка не
                поднимается выше 30. Наведите на цифру — покажет разбор по проекту.
              </span>
              <span className="mt-2 block">Сначала идут проекты с самой низкой оценкой. «Куда дать внимание» — до трёх действий из лога проекта.</span>
            </InfoHint>
          </h2>
        </div>
        {activeProjects.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 lg:gap-5 2xl:grid-cols-3">
            {ordered.map((p) => (
              <ProjectCard key={p.id} project={p} attention={attention.get(p.id)} />
            ))}
          </div>
        ) : (
          <Placeholder>Активных проектов пока нет</Placeholder>
        )}
      </section>
    </div>
  );
}
