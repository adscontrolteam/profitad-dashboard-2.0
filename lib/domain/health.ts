/**
 * Project health: one number 0–100 that says how much attention the project needs now.
 *
 * Built the way account health scores usually are: each signal is brought to 0–100 by linear interpolation between
 * its red / yellow / green thresholds, the signals are combined as a weighted average, and the result is read in
 * three bands. A signal with nothing to judge by (no plan, too early in the week) drops out and the remaining
 * weights are rescaled — a missing number must not look like a bad or a good one.
 */

import { PACE_ON_PLAN, type CatchUp } from "./stats";

export type HealthZone = "green" | "yellow" | "red" | "none";

export interface HealthPart {
  key: "result" | "week" | "price" | "flow" | "issues";
  label: string;
  weight: number;
  /** 0–100, null = nothing to judge by. */
  score: number | null;
  note: string;
}

export interface Health {
  /** null = neither a plan nor data: nothing to score yet. */
  score: number | null;
  zone: HealthZone;
  parts: HealthPart[];
  /** Why the score was capped, when a hard rule fired. */
  cap: string | null;
}

export interface HealthInput {
  /** Share of the month behind us, 0..1. */
  elapsed: number;
  /** Main result of the month. */
  fact: number;
  plan: number | null;
  /** forecast / plan at the current pace. */
  pace: number | null;
  cpaFact: number | null;
  cpaPlan: number | null;
  spend: number;
  /** Current week against what its plan expects by today; null when under one result was due. */
  week: { fact: number; expected: number } | null;
  /** Last 7 whole days. */
  recent: { results: number; spend: number };
  /** Behind the plan: what is needed per day and what the last week gives. Null = on plan or nothing to judge. */
  catchUp: CatchUp | null;
  /** Open «Фокус» entries. */
  issues: { focus: "scale" | "stop" | "fix" | "decide" }[];
}

export const HEALTH_GREEN = 70;
export const HEALTH_YELLOW = 40;

/** Piecewise-linear score through (value, score) points sorted by value. */
function curve(value: number, points: [number, number][]) {
  if (value <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (value <= x1) return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

const ISSUE_COST = { stop: 40, fix: 35, decide: 25, scale: 0 } as const;
const pct = (v: number) => `${Math.round(v * 100)} %`;

const perDay = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace(".", ","));

export function projectHealth(i: HealthInput): Health {
  const behind = i.pace !== null && i.pace < PACE_ON_PLAN && i.elapsed < 1;
  const catching = behind && !!i.catchUp?.catching;
  const tempo = i.catchUp ? `нужно ${perDay(i.catchUp.needPerDay)} в день, за последние 2 дня шло ${perDay(i.catchUp.recentPerDay)}` : "";
  // On plan (within 5%) = 90–100, 15% behind = 60, half the plan = 25.
  const byPace = i.pace !== null ? curve(i.pace, [[0, 0], [0.5, 25], [0.85, 60], [PACE_ON_PLAN, 90], [1, 100]]) : null;
  const parts: HealthPart[] = [
    {
      key: "result",
      label: "Результат к плану месяца",
      weight: 40,
      // A plan without a pace means there is no data yet: after the first days of the month that is a zero, not a gap.
      // Behind, but the last two days are fast enough to close the plan: judged as nearly on plan.
      score: byPace !== null ? (catching ? Math.max(byPace, 85) : byPace) : i.plan !== null && i.elapsed >= 0.1 ? 0 : null,
      note:
        i.pace === null
          ? i.plan === null
            ? "план не задан"
            : "данных о результате нет"
          : !behind
            ? `в плане: по темпу выйдет ${pct(i.pace)}`
            : catching
              ? `отстаём (по темпу месяца ${pct(i.pace)} плана), но догоняем: ${tempo}`
              : `отстаём: по темпу выйдет ${pct(i.pace)} плана${tempo ? `, ${tempo}` : ""}`,
    },
    {
      key: "week",
      label: "Эта неделя",
      weight: 15,
      score: i.week ? curve(i.week.fact / i.week.expected, [[0, 0], [0.6, 50], [1, 100]]) : null,
      note: i.week ? `${pct(i.week.fact / i.week.expected)} от положенного к сегодня` : "рано судить",
    },
    {
      key: "price",
      label: "Цена результата",
      weight: 20,
      // At the target = 100, 30% dearer = 50, twice the target = 0. Spend without a single result = 0.
      score:
        i.cpaPlan === null
          ? null
          : i.cpaFact !== null
            ? curve(i.cpaFact / i.cpaPlan, [[1, 100], [1.3, 50], [2, 0]])
            : i.spend > 0
              ? 0
              : null,
      note:
        i.cpaPlan === null
          ? "цель по цене не задана"
          : i.cpaFact !== null
            ? `${pct(i.cpaFact / i.cpaPlan)} от целевой`
            : i.spend > 0
              ? "расход есть, результатов нет"
              : "расхода ещё нет",
    },
    {
      key: "flow",
      label: "Результаты за 7 дней",
      weight: 15,
      score: i.recent.results > 0 ? 100 : i.recent.spend > 0 ? 30 : 0,
      note: i.recent.results > 0 ? "результаты идут" : i.recent.spend > 0 ? "реклама крутится, результатов нет" : "ни расхода, ни результатов",
    },
    {
      key: "issues",
      label: "Открытые вопросы",
      weight: 10,
      score: Math.max(100 - i.issues.reduce((a, x) => a + ISSUE_COST[x.focus], 0), 0),
      note: i.issues.length ? `в фокусе: ${i.issues.length}` : "ничего не ждёт",
    },
  ];

  const hasPlan = i.plan !== null || i.cpaPlan !== null;
  const hasData = i.spend > 0 || i.fact > 0 || i.recent.spend > 0 || i.recent.results > 0;
  if (!hasPlan && !hasData) return { score: null, zone: "none", parts, cap: null };

  const judged = parts.filter((p) => p.score !== null);
  const weight = judged.reduce((a, p) => a + p.weight, 0);
  let score = judged.reduce((a, p) => a + (p.score as number) * p.weight, 0) / weight;

  // Hard rule: a quarter of the month gone and not one result — the project is red whatever else looks fine.
  let cap: string | null = null;
  // Hard rule: behind the plan and the current tempo does not close the gap — never green, whatever else looks fine.
  if (behind && !catching && score >= HEALTH_GREEN) {
    cap = `отстаём от плана на ${pct(1 - (i.pace as number))}, текущий темп не догоняет`;
    score = HEALTH_GREEN - 1;
  }
  if (i.plan !== null && i.elapsed >= 0.25 && i.fact === 0) {
    cap = "четверть месяца позади, а результатов нет";
    score = Math.min(score, 30);
  }

  const rounded = Math.round(score);
  return { score: rounded, zone: rounded >= HEALTH_GREEN ? "green" : rounded >= HEALTH_YELLOW ? "yellow" : "red", parts, cap };
}

export const HEALTH_LABEL: Record<HealthZone, string> = {
  green: "всё идёт, внимания не требует",
  yellow: "нужно внимание: отстаём от плана или просела цена",
  red: "горит: результата нет или он далеко от плана",
  none: "пока нечего оценивать",
};

export const healthTitle = (h: Health) =>
  [
    h.score === null ? HEALTH_LABEL.none : `Оценка проекта ${h.score} из 100 — ${HEALTH_LABEL[h.zone]}`,
    ...h.parts.map((p) => `${p.label} (вес ${p.weight}): ${p.score === null ? "—" : Math.round(p.score)} · ${p.note}`),
    ...(h.cap ? [`Ограничение: ${h.cap}`] : []),
  ].join("\n");
