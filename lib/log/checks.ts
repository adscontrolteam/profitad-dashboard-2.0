import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, leads, projectIntegrations, projectPlans, projects } from "@/db/schema";
import { FROM_ADS } from "@/lib/integrations/store";
import { currentMonth } from "@/lib/projects/plans";
import { dbSource } from "@/lib/data/sources/db";
import { METRICS } from "@/lib/domain/metrics";
import { formatMetric } from "@/lib/format";
import { monthOf } from "@/lib/projects/plans";
import { listWeekOverrides } from "@/lib/projects/week-store";
import { addDays, weekElapsed, weekPlan, weekStartOf } from "@/lib/projects/weeks";
import { condition } from "./store";

const KIND_LABEL: Record<string, string> = {
  sheets_leads: "таблица лидов",
  sheets_report: "таблица «Репорт»",
  crm: "CRM",
  meta_ads: "Meta Ads",
  google_ads: "статистика Google Ads",
  drive: "папка Drive",
};
/** Which log shows a sync problem: ad stats and leads → «Реклама», the rest → the project. */
const AREA_OF_KIND: Record<string, "ads" | "smm" | "project"> = { meta_ads: "ads", google_ads: "ads", sheets_leads: "ads", crm: "ads" };

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Sync results of the nightly run → open / close «синхронизация не прошла» entries. */
export async function logSyncResults(results: { projectId: string; kind: string; ok: boolean; message: string }[]) {
  for (const r of results) {
    const what = KIND_LABEL[r.kind] ?? r.kind;
    await condition(
      r.projectId,
      `sync:${r.kind}`,
      !r.ok,
      { kind: "error", title: `Не обновилась ${what}`, body: r.message, link: "/inputs", area: AREA_OF_KIND[r.kind] ?? "project" },
      "Синхронизация снова прошла",
    ).catch(() => undefined);
  }
}

/** Daily checks of every active project: plan for the month, sheet vs ad cabinet, leads left without a status. */
export async function runProjectChecks() {
  const db = getDb();
  const list = await db.select({ id: projects.id, status: projects.status }).from(projects);
  const month = currentMonth();
  for (const p of list) {
    if (p.status !== "active") continue;
    await checkWeekPace(p.id).catch((error) => console.error("week pace check failed", p.id, error));
    try {
      // 1. The month has its own plan.
      const [own] = await db
        .select({ n: sql<number>`count(*)` })
        .from(projectPlans)
        .where(and(eq(projectPlans.projectId, p.id), eq(projectPlans.month, month)));
      const [prev] = await db
        .select({ month: sql<string | null>`max(${projectPlans.month})` })
        .from(projectPlans)
        .where(eq(projectPlans.projectId, p.id));
      await condition(
        p.id,
        `plan:${month}`,
        Number(own?.n ?? 0) === 0,
        {
          kind: "warning",
          title: `План на ${monthName(month)} не задан`,
          body: prev?.month ? `Пока действует план за ${monthName(prev.month)}. Задайте бюджет и цели Б / Б+ / С во «Вводных».` : "Задайте бюджет и цели Б / Б+ / С во «Вводных».",
          link: "/inputs",
          area: "project",
          focus: "fix",
          effortMin: 10,
        },
        "План на месяц задан",
      );

      const [src] = await db
        .select({ n: sql<number>`count(*)` })
        .from(projectIntegrations)
        .where(and(eq(projectIntegrations.projectId, p.id), sql`${projectIntegrations.kind} in ('sheets_leads', 'crm')`));
      if (Number(src?.n ?? 0) === 0) continue;

      // 2. The cabinet sees far fewer leads than the client's sheet (last 3 full days).
      const [gap] = (
        await db.execute(sql`
          select
            (select count(*) from ${leads}
              where ${leads.projectId} = ${p.id} and ${leads.outcome} <> 'junk' and ${FROM_ADS}
                and (${leads.leadAt} at time zone 'UTC')::date between current_date - 3 and current_date - 1) as sheet,
            (select coalesce(sum(${adMetricsDaily.leads}), 0) from ${adMetricsDaily}
              where ${adMetricsDaily.projectId} = ${p.id} and ${adMetricsDaily.date} between current_date - 3 and current_date - 1) as cabinet,
            (select count(*) from ${adMetricsDaily}
              where ${adMetricsDaily.projectId} = ${p.id} and ${adMetricsDaily.date} between current_date - 3 and current_date - 1) as ad_rows`)
      ).rows as { sheet: number; cabinet: number; ad_rows: number }[];
      const sheet = Number(gap?.sheet ?? 0), cabinet = Number(gap?.cabinet ?? 0);
      await condition(
        p.id,
        "gap",
        Number(gap?.ad_rows ?? 0) > 0 && sheet >= 3 && cabinet < sheet * 0.7,
        {
          kind: "warning",
          title: `Кабинет видит ${Math.round(cabinet)} заявок из ${sheet} за 3 дня`,
          body: "По таблице клиента лидов с рекламы заметно больше, чем конверсий в кабинете. Проверьте, какие конверсии отмечены «заявкой» и срабатывают ли они на сайте — от этого зависит, на чём учится автостратегия.",
          link: "/inputs",
          area: "ads",
          focus: "fix",
          effortMin: 30,
        },
        "Кабинет снова видит почти все заявки",
      );

      // 3. Ad leads left in «Новий» for more than two days.
      const [stale] = (
        await db.execute(sql`
          select count(*) as n from ${leads}
          where ${leads.projectId} = ${p.id} and ${leads.outcome} = 'new' and ${FROM_ADS}
            and ${leads.leadAt} < now() - interval '48 hours' and ${leads.leadAt} > now() - interval '30 days'`)
      ).rows as { n: number }[];
      const n = Number(stale?.n ?? 0);
      await condition(
        p.id,
        "stale_new",
        n > 0,
        {
          kind: "warning",
          title: `${n} ${n === 1 ? "лид" : n < 5 ? "лида" : "лидов"} с рекламы без статуса дольше 2 дней`,
          body: "В таблице клиента у них всё ещё «Новий». Либо менеджер не связался, либо не обновил статус — без этого не видно, какая реклама приводит клиентов.",
          link: `/ads/leads?p=${p.id}`,
          area: "ads",
          focus: "fix",
          effortMin: 10,
        },
        "Статусы проставлены",
      );
    } catch (error) {
      console.error("project checks failed", p.id, error);
    }
  }
}

const WEEKDAYS = ["понедельнику", "вторнику", "среде", "четвергу", "пятнице", "субботе", "воскресенью"];

/**
 * The week is behind its plan: by the middle of the week the main result is under 60% of what the plan expects
 * by now. Judged only when at least one whole result was due — below that a week is noise, not a signal.
 */
async function checkWeekPace(projectId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf(today);
  const topic = `week:${weekStart}`;
  const elapsed = weekElapsed(weekStart, today);
  const base = await dbSource.getProject(projectId);
  if (!base) return;
  const fallback = base.plans.length ? null : { kpis: base.kpis, budgetMonth: base.agent.budgetMonth };
  const plan = weekPlan(base.plans, await listWeekOverrides(projectId), weekStart, monthOf(base.startDate), fallback);
  const metric = base.kpis[0]?.metric;
  const target = metric ? plan[metric]?.plan : undefined;
  if (!metric || !target || elapsed < 3 / 7) return condition(projectId, topic, false, { kind: "warning", title: "" }, "Неделя идёт по плану");

  // Whole days only: today's numbers are still coming in.
  const done = await dbSource.getProject(projectId, { start: weekStart, end: addDays(today, -1) });
  const fact = done?.metrics[metric] ?? 0;
  const expected = target * elapsed;
  const behind = expected >= 1 && fact < expected * 0.6;
  const unit = METRICS[metric].label.toLowerCase();
  const price = base.kpis[0]?.cpaPlan ?? null;
  // No spend at all means the cabinet is silent (not connected or ads are off): a different problem than a slow week.
  const silent = fact === 0 && (done?.metrics.spend ?? 0) === 0;
  const num = (v: number) => formatMetric(Math.round(v * 10) / 10, METRICS[metric].format, base.agent.currency);
  await condition(
    projectId,
    topic,
    behind,
    {
      kind: "warning",
      area: "project",
      title: silent
        ? `Неделя без данных: ни расхода, ни результатов при плане ${num(target)} (${unit})`
        : `Неделя отстаёт: ${unit} ${num(fact)} из ${num(target)}, к ${WEEKDAYS[Math.round(elapsed * 7)] ?? "концу недели"} нужно ${num(expected)}`,
      body: silent
        ? `Прошло ${Math.round(elapsed * 7)} из 7 дней, а по проекту нет ни расхода, ни результатов. Либо реклама не идёт, либо рекламный кабинет не подключён к дашборду — проверьте «Вводные» → проект → источники и «Подключения».`
        : `План недели ${num(target)}, прошло ${Math.round(elapsed * 7)} из 7 дней. Чтобы закрыть неделю в план, до воскресенья нужно ещё ${num(Math.max(target - fact, 0))}. ` +
        "Посмотрите, что изменилось: расход идёт ли по бюджету недели, не упали ли показы, нет ли ограниченных объявлений, доходят ли заявки.",
      link: `/projects/${projectId}`,
      focus: silent ? "fix" : "decide",
      impact: price ? Math.round((expected - fact) * price * 100) / 100 : null,
      effortMin: 30,
    },
    "Неделя вернулась в план",
  );
}
