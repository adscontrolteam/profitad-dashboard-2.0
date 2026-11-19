import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { briefAsText, getBrief } from "@/lib/brief/store";
import { getProject } from "@/lib/data";
import { METRICS, PLATFORM_LABELS } from "@/lib/domain/metrics";
import { GOAL_LEVELS, type Kpi } from "@/lib/domain/types";
import { formatDate, formatMetric } from "@/lib/format";
import { listIntegrations } from "@/lib/integrations/store";
import { appUrl } from "@/lib/log/notify";
import { listOwnerCandidates } from "@/lib/projects/owners";
import { currentMonth, monthOf, planFor } from "@/lib/projects/plans";

/**
 * Стартовое сообщение проекта в Telegram-чат: о проекте, KPI и бюджет первого месяца, источники, что уже есть,
 * команда, все ссылки. Цифры и ссылки собираются из базы кодом — модель пишет только пересказ брифа.
 */
const MODEL = "claude-opus-5-5";
/** Telegram's limit for one message. */
export const TELEGRAM_LIMIT = 4096;

const BriefDigest = z.object({
  about: z.array(z.string()).describe("О проекте, 3–6 коротких пунктов: чем занимается клиент, что продаём (оффер), кому (аудитория), где (гео), чем отличается."),
  now: z.array(z.string()).describe("Что есть на сейчас, 2–6 пунктов: сайт и на чём сделан, рекламные кабинеты, аналитика и пиксели, CRM, соцсети, креативы, что уже пробовали и с каким результатом."),
  important: z.array(z.string()).describe("Что важно учесть, 0–5 пунктов: ограничения и запреты, что клиент считает заявкой, сроки, пожелания к коммуникации."),
  site: z.string().describe("Адрес сайта или посадочной из брифа, как указан клиентом. Пустая строка, если не указан."),
  unconfirmed: z.boolean().describe("true, если заметки агентства говорят, что бриф (или его заметная часть) заполнен нами и клиент его не подтверждал."),
});
type Digest = z.infer<typeof BriefDigest>;

const SYSTEM = `Ты — Дирижёр команды рекламного агентства PROFITAD. По брифу клиента ты готовишь выжимку для стартового сообщения в рабочий чат проекта: его прочитают медиабайер, SMM-специалист и руководитель перед началом работы.

Правила:
- По-русски, каждый пункт — одна короткая строка без точки в конце, без Markdown и без эмодзи.
- Только факты из брифа и заметок. Ничего не додумывай: если про что-то не сказано — не пиши этот пункт. Пустой список лучше выдуманного.
- Цели, KPI, бюджет и ссылки на таблицы не пересказывай — их добавит дашборд отдельным блоком.
- Заметки агентства в квадратных скобках — наши, не клиента: учитывай их как факты. Пометку «клиент не подтверждал» к пунктам не дописывай — для этого есть поле unconfirmed.`;

async function digestBrief(projectName: string, briefText: string, notes: string): Promise<Digest | null> {
  if (!process.env.ANTHROPIC_API_KEY || (!briefText.trim() && !notes.trim())) return null;
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(BriefDigest) },
    messages: [
      {
        role: "user",
        content: [`Проект: ${projectName}`, "", "Бриф клиента:", briefText.trim() || "(не заполнен)", "", "Заметки в карточке проекта:", notes.trim() || "(нет)"].join("\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return response.parsed_output;
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

function kpiLine(kpi: Kpi, currency: string | null) {
  const def = METRICS[kpi.metric];
  const levels = GOAL_LEVELS.flatMap((lv) => {
    const amount = kpi[lv.plan] as number | null | undefined;
    if (amount === null || amount === undefined) return [];
    const price = kpi[lv.cpa] as number | null | undefined;
    return [`${lv.label} ${formatMetric(amount, def.format, currency)}${price ? ` по ${formatMetric(price, "currency", currency)}` : ""}`];
  });
  return `— ${def.label}: ${levels.length ? levels.join(" · ") : "план не задан"}`;
}

/** Google Ads ids read as 123-456-7890, the way the cabinet shows them. */
const accountLabel = (platform: string, id: string) => (platform === "google" && /^\d{10}$/.test(id) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id);

const list = (items: string[]) => items.map((s) => `— ${s.trim().replace(/^[—–-]\s*/, "")}`).join("\n");

export interface Kickoff {
  text: string;
  /** What is missing and worth filling in before sending. */
  gaps: string[];
  /** The brief digest came from the model (false = no key, empty brief, or the model failed). */
  withDigest: boolean;
}

export async function buildKickoff(projectId: string): Promise<Kickoff | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const [brief, integrations, candidates] = await Promise.all([getBrief(projectId), listIntegrations(projectId), listOwnerCandidates().catch(() => null)]);
  const briefText = brief ? briefAsText(brief) : "";
  const digest = await digestBrief(project.name, briefText, project.notes).catch(() => null);
  const currency = project.agent.currency;
  const gaps: string[] = [];

  // A new project: the plan of its first month. A project already in work: the plan of the current month.
  const startMonth = monthOf(project.startDate);
  const month = startMonth > currentMonth() ? startMonth : currentMonth();
  const first = planFor(project.plans, month, startMonth, null);
  const kpis = first?.kpis.length ? first.kpis : project.kpis;
  const budget = first?.budgetMonth ?? project.agent.budgetMonth;
  if (!kpis.some((k) => k.plan !== null)) gaps.push("не задан план KPI");
  if (budget === null) gaps.push("не задан рекламный бюджет");
  if (!project.sources.length) gaps.push("не выбраны источники трафика");
  if (!briefText.trim()) gaps.push("бриф клиента не заполнен");

  const nameOf = (email: string | null, pool: { email: string; label: string }[] | undefined) =>
    email ? (pool?.find((c) => c.email === email)?.label.replace(/ · админ$/, "") ?? email) : "не назначен";
  const url = (kind: string) => (integrations.find((i) => i.kind === kind)?.config as { url?: string } | undefined)?.url ?? null;
  const base = appUrl();
  const id = encodeURIComponent(project.id);
  const links: [string, string | null | undefined][] = [
    ["Сайт", digest?.site],
    ["Дашборд проекта", `${base}/projects/${id}`],
    ["Реклама", `${base}/ads?p=${id}`],
    ["SMM", `${base}/smm?p=${id}`],
    ["Бриф клиента (полный)", `${base}/inputs/brief/${id}`],
    ["Папка проекта на Drive", url("drive")],
    ["Репорт", url("sheets_report")],
    ["Leads & Sales", url("sheets_leads")],
    ["GA4", project.services.ga4],
    ["GTM", project.services.gtm],
    ["Clarity", project.services.clarity],
    ["Search Console", project.services.searchConsole],
  ];
  if (!url("drive")) gaps.push("нет папки проекта на Drive");

  const blocks = [
    `🚀 Старт проекта «${project.name}»`,
    project.goal ? `Цель: ${project.goal}` : null,
    `В работе с ${formatDate(project.startDate)} ${project.startDate.slice(0, 4)}`,
    digest?.about.length ? `О ПРОЕКТЕ\n${list(digest.about)}` : project.notes.trim() ? `О ПРОЕКТЕ\n${project.notes.trim().slice(0, 900)}` : null,
    [
      month === startMonth ? `KPI НА ПЕРВЫЙ МЕСЯЦ (${monthLabel(month)})` : `KPI НА ${monthLabel(month).toUpperCase()}`,
      ...(kpis.length ? kpis.map((k) => kpiLine(k, currency)) : ["— план не задан"]),
      `— Рекламный бюджет: ${budget === null ? "не задан" : `${formatMetric(budget, "currency", currency)} в месяц`}`,
      "Б — базовая цель (100%), Б+ и С — перевыполнение",
    ].join("\n"),
    `ИСТОЧНИКИ ТРАФИКА\n${
      project.sources.length
        ? project.sources.map((s) => `— ${PLATFORM_LABELS[s.platform]}: ${s.accountId ? `кабинет ${accountLabel(s.platform, s.accountId)}` : "доступа к кабинету пока нет"}`).join("\n")
        : "— не выбраны"
    }`,
    digest?.now.length ? `ЧТО ЕСТЬ НА СЕЙЧАС\n${list(digest.now)}` : null,
    digest?.important.length ? `ЧТО ВАЖНО УЧЕСТЬ\n${list(digest.important)}` : null,
    digest?.unconfirmed ? "⚠️ Бриф заполнен нами по своим материалам, клиент его ещё не подтверждал." : null,
    `КОМАНДА\n— MediaBuyer: ${nameOf(project.owners.mediaBuyer, candidates?.mediaBuyer)}\n— SMM: ${nameOf(project.owners.smm, candidates?.smm)}`,
    `ССЫЛКИ\n${links
      .filter((l): l is [string, string] => Boolean(l[1]?.trim()))
      .map(([label, href]) => `— ${label}: ${href.trim()}`)
      .join("\n")}`,
    "ГДЕ УЗНАТЬ БОЛЬШЕ\n— Полный бриф клиента — по ссылке выше\n— План, факт, лог и фокус — на странице проекта в дашборде\n— Вопросы по проекту — блок «Вопрос агенту» внизу страницы проекта",
  ];
  return { text: blocks.filter(Boolean).join("\n\n"), gaps, withDigest: Boolean(digest) };
}

/** Splits a long message at paragraph borders so that every part fits one Telegram message. */
export function splitForTelegram(text: string, limit = TELEGRAM_LIMIT) {
  const parts: string[] = [];
  let current = "";
  for (const block of text.trim().split(/\n{2,}/)) {
    for (let piece = block; piece; ) {
      const chunk = piece.slice(0, limit);
      piece = piece.slice(limit);
      if (current && current.length + 2 + chunk.length > limit) {
        parts.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${chunk}` : chunk;
    }
  }
  if (current) parts.push(current);
  return parts;
}
