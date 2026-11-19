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

const bullets = (what: string) => z.array(z.string()).describe(what);
const BriefDigest = z.object({
  sites: z
    .array(z.object({ url: z.string(), note: z.string().describe("Что это: основной сайт, посадочная под услугу, язык. 2–6 слов.") }))
    .describe("Действующие сайты и посадочные страницы, на которые ведём рекламу. Адреса как в брифе."),
  archive: z
    .array(z.object({ url: z.string(), note: z.string() }))
    .describe("Старые или запасные посадочные, которые сейчас не используются. Пусто, если таких нет."),
  business: z.string().describe("Про бизнес и продукт, 1–3 предложения: чем занимается компания и чем помогает клиенту."),
  facts: bullets("Факты доверия, 0–4 пункта: сколько лет на рынке, размер команды, языки обслуживания, рейтинг и отзывы, лицензии, страховка."),
  services: bullets("Все услуги или продукты компании, коротким списком."),
  advertise: bullets("Что именно рекламируем сейчас, 1–4 пункта. Если часть услуг не рекламируем — отдельным пунктом «не рекламируем: …»."),
  languages: z.string().describe("Языки рекламы через запятую. Пусто, если не сказано."),
  geo: z.string().describe("Гео рекламы: страны, регионы, города. Пусто, если не сказано."),
  goal: z.string().describe("Бизнес-цель рекламы словами клиента, одной фразой (например: стабильный поток целевых заявок с ROAS выше 6). Пусто, если не сказано."),
  budgetNote: z.string().describe("Оговорка к бюджету из брифа, несколько слов (например: поднимаем, когда пойдут продажи). Пусто, если нет."),
  pointA: bullets("Точка А — что есть на сейчас, 2–6 пунктов: какие кампании уже идут и с каким результатом, что заблокировано, что с аналитикой и учётом заявок, CRM, креативы, что готовится."),
  competitors: z.string().describe("Конкуренты: кто и чем отличаются, 1–2 предложения. Пусто, если в брифе не заполнено."),
  pricing: z.string().describe("Стоимость услуг относительно рынка или вилка цен, одной фразой. Пусто, если не сказано."),
  advantages: bullets("Преимущества и отличия, 0–5 пунктов."),
  pains: bullets("Боли и страхи целевой аудитории, 0–8 пунктов, по возможности словами клиента."),
  antiPortrait: bullets("Анти-портрет: кто НЕ наша аудитория и по каким запросам её узнать, 0–5 пунктов."),
  important: bullets("Что важно учесть, 0–5 пунктов: запреты и ограничения в рекламе, что считаем заявкой, сроки, пожелания к коммуникации."),
  unconfirmed: z.boolean().describe("true, если заметки агентства говорят, что бриф (или его заметная часть) заполнен нами и клиент его не подтверждал."),
});
type Digest = z.infer<typeof BriefDigest>;

const SYSTEM = `Ты — Дирижёр команды рекламного агентства PROFITAD. По брифу клиента ты готовишь выжимку для стартового сообщения в рабочий чат проекта: его прочитают медиабайер, SMM-специалист и руководитель перед началом работы. По этому сообщению человек, который ничего не знает о клиенте, должен понять, что продаём, кому, где и что уже сделано.

Правила:
- По-русски, каждый пункт — одна короткая строка без точки в конце, без Markdown и без эмодзи.
- Только факты из брифа и заметок. Ничего не додумывай: если про что-то не сказано — оставь поле пустым. Пустое поле попадёт в сообщение как «не заполнено», и это полезнее выдумки.
- KPI в цифрах, сумму бюджета и ссылки на таблицы не пересказывай — их добавит дашборд отдельными блоками.
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

/** A reason a person can act on, for the errors that are theirs to fix. */
export function aiErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/credit balance is too low/i.test(message)) return "На счёте Anthropic API закончились средства. Пополните баланс: console.anthropic.com → Plans & Billing.";
  if (error instanceof Anthropic.AuthenticationError) return "Ключ ИИ недействителен (ANTHROPIC_API_KEY).";
  if (error instanceof Anthropic.RateLimitError) return "Слишком много запросов к ИИ. Повторите через минуту.";
  if (error instanceof Anthropic.APIError) return `ИИ сейчас недоступен (${error.status ?? "сеть"}).`;
  return `ИИ не ответил: ${message.slice(0, 200)}`;
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** Google Ads ids read as 123-456-7890, the way the cabinet shows them. */
const accountLabel = (platform: string, id: string) => (platform === "google" && /^\d{10}$/.test(id) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id);

const clean = (v: string) => v.trim().replace(/^[—–-]\s*/, "");
const list = (items: string[]) => items.map((v) => `— ${clean(v)}`).join("\n");
const EMPTY = "не заполнено";
/** 500 €, not 500,00 €; cents only when there are any. */
const money = (value: number, currency: string | null) =>
  currency
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value)
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);

function kpiLine(kpi: Kpi, currency: string | null) {
  const def = METRICS[kpi.metric];
  const amount = (v: number) => (def.format === "currency" ? money(v, currency) : formatMetric(v, def.format, currency));
  const levels = GOAL_LEVELS.flatMap((lv) => {
    const plan = kpi[lv.plan] as number | null | undefined;
    if (plan === null || plan === undefined) return [];
    const price = kpi[lv.cpa] as number | null | undefined;
    return [`${lv.label} ${amount(plan)}${price ? ` по ${money(price, currency)}` : ""}`];
  });
  return `— ${def.label}: ${levels.length ? levels.join(" · ") : "план не задан"}`;
}

export interface Kickoff {
  text: string;
  /** What is missing and worth filling in before sending. */
  gaps: string[];
  /** The brief digest came from the model (false = no key, empty brief, or the model failed). */
  withDigest: boolean;
  /** Why the model part is missing, when it failed. */
  digestError: string | null;
}

/**
 * The order follows the intro the team writes by hand: site → business → what we advertise → ad settings →
 * goal and KPI → point A → competitors, price, advantages → pains and anti-portrait → accesses → report and leads.
 * A field the brief does not answer is printed as «не заполнено», so the gap is visible in the chat too.
 */
export async function buildKickoff(projectId: string): Promise<Kickoff | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const [brief, integrations, candidates] = await Promise.all([getBrief(projectId), listIntegrations(projectId), listOwnerCandidates().catch(() => null)]);
  const briefText = brief ? briefAsText(brief) : "";
  let digestError: string | null = null;
  const d = await digestBrief(project.name, briefText, project.notes).catch((error) => {
    // The message is still built from the inputs; the person sees why the brief part is missing.
    console.error("kickoff digest failed", projectId, error instanceof Error ? error.message : error);
    digestError = aiErrorText(error);
    return null;
  });
  const currency = project.agent.currency;
  const gaps: string[] = [];

  // A new project: the plan of its first month. A project already in work: the plan of the current month.
  const startMonth = monthOf(project.startDate);
  const month = startMonth > currentMonth() ? startMonth : currentMonth();
  const plan = planFor(project.plans, month, startMonth, null);
  const kpis = plan?.kpis.length ? plan.kpis : project.kpis;
  const budget = plan?.budgetMonth ?? project.agent.budgetMonth;
  if (!kpis.some((k) => k.plan !== null)) gaps.push("не задан план KPI");
  if (budget === null) gaps.push("не задан рекламный бюджет");
  if (!project.sources.length) gaps.push("не выбраны источники трафика");
  if (!briefText.trim()) gaps.push("бриф клиента не заполнен");

  const nameOf = (email: string | null, pool: { email: string; label: string }[] | undefined) =>
    email ? (pool?.find((c) => c.email === email)?.label.replace(/ · админ$/, "") ?? email) : "не назначен";
  const url = (kind: string) => (integrations.find((i) => i.kind === kind)?.config as { url?: string } | undefined)?.url ?? null;
  if (!url("drive")) gaps.push("нет папки проекта на Drive");
  const base = appUrl();
  const id = encodeURIComponent(project.id);

  // Fields of the brief digest: a missing one is shown as «не заполнено» and listed in the hint above the text.
  const missing: string[] = [];
  const text = (label: string, value: string | undefined) => {
    if (value?.trim()) return clean(value);
    if (d) missing.push(label);
    return EMPTY;
  };
  const items = (label: string, values: string[] | undefined) => {
    if (values?.length) return list(values);
    if (d) missing.push(label);
    return `— ${EMPTY}`;
  };
  const linkList = (links: { url: string; note: string }[]) => links.map((l) => `— ${l.url.trim()}${l.note.trim() ? ` — ${clean(l.note)}` : ""}`).join("\n");

  const sources = project.sources.length
    ? project.sources.map((s) => `${PLATFORM_LABELS[s.platform]}${s.accountId ? ` (кабинет ${accountLabel(s.platform, s.accountId)})` : " (доступа к кабинету пока нет)"}`).join(", ")
    : "не выбраны";
  const has = (value: string | null | undefined) => (value?.trim() ? "есть" : "нет");
  const access = [
    ...project.sources.map((s) => `— ${PLATFORM_LABELS[s.platform]}: ${s.accountId ? `есть, кабинет ${accountLabel(s.platform, s.accountId)}` : "нет"}`),
    `— GA4: ${has(project.services.ga4)}`,
    `— GTM: ${has(project.services.gtm)}`,
    `— Clarity: ${has(project.services.clarity)}`,
    `— Search Console: ${has(project.services.searchConsole)}`,
  ];
  const serviceLinks: [string, string | undefined][] = [
    ["GA4", project.services.ga4],
    ["GTM", project.services.gtm],
    ["Clarity", project.services.clarity],
    ["Search Console", project.services.searchConsole],
  ];
  const isLink = (v: string | undefined): v is string => /^https?:\/\//.test(v?.trim() ?? "");

  const blocks: (string | null)[] = [
    `🚀 Старт проекта «${project.name}»\nВ работе с ${formatDate(project.startDate)} ${project.startDate.slice(0, 4)}`,
    d ? `САЙТ / ПОСАДОЧНАЯ\n${d.sites.length ? linkList(d.sites) : (missing.push("сайт"), `— ${EMPTY}`)}` : null,
    d
      ? [`ПРО БИЗНЕС / ПРОДУКТ`, text("про бизнес", d.business), ...(d.facts.length ? [list(d.facts)] : [])].join("\n")
      : project.notes.trim()
        ? `ПРО БИЗНЕС / ПРОДУКТ\n${project.notes.trim().slice(0, 900)}`
        : null,
    d ? `УСЛУГИ\n${items("услуги", d.services)}` : null,
    d ? `ЧТО РЕКЛАМИРУЕМ\n${items("что рекламируем", d.advertise)}` : null,
    [
      "ПАРАМЕТРЫ РЕКЛАМЫ",
      ...(d ? [`— Язык рекламы: ${text("язык рекламы", d.languages)}`, `— Гео рекламы: ${text("гео рекламы", d.geo)}`] : []),
      `— Источники: ${sources}`,
      `— Рекламный бюджет: ${budget === null ? "не задан" : `${money(budget, currency)} в месяц`}${d?.budgetNote.trim() ? ` (${clean(d.budgetNote)})` : ""}`,
    ].join("\n"),
    [
      month === startMonth ? `ЦЕЛЬ И KPI НА ПЕРВЫЙ МЕСЯЦ (${monthLabel(month)})` : `ЦЕЛЬ И KPI НА ${monthLabel(month).toUpperCase()}`,
      `— Цель: ${d?.goal.trim() ? clean(d.goal) : project.goal || EMPTY}`,
      ...(kpis.length ? kpis.map((k) => kpiLine(k, currency)) : ["— KPI: план не задан"]),
      "Б — базовая цель (100%), Б+ и С — перевыполнение",
    ].join("\n"),
    d ? `ТОЧКА А: ЧТО ЕСТЬ НА СЕЙЧАС\n${items("точка А", d.pointA)}` : null,
    d ? `КОНКУРЕНТЫ\n— ${text("конкуренты", d.competitors)}` : null,
    d ? `СТОИМОСТЬ УСЛУГ\n— ${text("стоимость услуг", d.pricing)}` : null,
    d ? `ПРЕИМУЩЕСТВА\n${items("преимущества", d.advantages)}` : null,
    d ? `БОЛИ И СТРАХИ ЦА\n${items("боли и страхи ЦА", d.pains)}` : null,
    d ? `АНТИ-ПОРТРЕТ: КТО НЕ НАША АУДИТОРИЯ\n${items("анти-портрет", d.antiPortrait)}` : null,
    d?.important.length ? `ЧТО ВАЖНО УЧЕСТЬ\n${list(d.important)}` : null,
    d?.unconfirmed ? "⚠️ Бриф заполнен нами по своим материалам, клиент его ещё не подтверждал." : null,
    `КОМАНДА\n— MediaBuyer: ${nameOf(project.owners.mediaBuyer, candidates?.mediaBuyer)}\n— SMM: ${nameOf(project.owners.smm, candidates?.smm)}`,
    `ДОСТУПЫ\n${access.join("\n")}`,
    `ОТЧЁТ\n— ${url("sheets_report") ?? "таблица отчёта не подключена"}`,
    `ЛИДЫ / ПРОДАЖИ\n— ${url("sheets_leads") ?? "таблица лидов не подключена"}`,
    [
      "ССЫЛКИ",
      `— Дашборд проекта: ${base}/projects/${id}`,
      `— Реклама: ${base}/ads?p=${id}`,
      `— SMM: ${base}/smm?p=${id}`,
      `— Бриф клиента (полный): ${base}/inputs/brief/${id}`,
      ...(url("drive") ? [`— Папка проекта на Drive: ${url("drive")}`] : []),
      ...serviceLinks.filter((l): l is [string, string] => isLink(l[1])).map(([label, href]) => `— ${label}: ${href.trim()}`),
    ].join("\n"),
    d?.archive.length ? `АРХИВ\n${linkList(d.archive)}` : null,
    "ГДЕ УЗНАТЬ БОЛЬШЕ\n— Полный бриф клиента — по ссылке выше\n— План, факт, лог и фокус — на странице проекта в дашборде\n— Вопросы по проекту — блок «Вопрос агенту» внизу страницы проекта",
  ];
  if (missing.length) gaps.push(`в брифе не заполнено: ${missing.join(", ")}`);
  return { text: blocks.filter(Boolean).join("\n\n"), gaps, withDigest: Boolean(d), digestError };
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
