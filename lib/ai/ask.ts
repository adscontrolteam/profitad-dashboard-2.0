import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adMetricsDaily, projectChat } from "@/db/schema";
import { getBrief, briefAsText } from "@/lib/brief/store";
import { getProject } from "@/lib/data";
import { listLog } from "@/lib/log/store";
import { buildProjectContext } from "./context";

/**
 * «Вопрос агенту»: answers about one project from what the dashboard knows about it — the client brief, the plan,
 * this month's numbers, campaigns of the last 30 days, the log — plus the earlier questions of this project.
 */
const MODEL = "claude-opus-5-5";
/** USD per million tokens (Claude Opus 5.5): input, cache write (1.25×), cache read, output. */
const PRICE = { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 };
export const ASK_DAILY_LIMIT = 60;
const HISTORY_TURNS = 12;
const MAX_QUESTION = 2000;

const SYSTEM = `Ты — Дирижёр команды рекламного агентства PROFITAD. Тебе задают вопросы по одному проекту — тому, чьи данные приведены ниже. Спрашивают сотрудники агентства: руководитель, медиабайер, SMM-специалист.

Как отвечать:
- По-русски, коротко и по делу: сначала прямой ответ, потом при необходимости 1–3 строки пояснения. Простой текст без Markdown-разметки; списки — строками через «—».
- Только из данных ниже и из прошлых вопросов и ответов. Называй, откуда факт: «в брифе», «в плане месяца», «в кабинете за 30 дней», «в логе».
- Если в данных ответа нет — так и скажи и назови, где это нужно заполнить или у кого спросить (бриф клиента, «Вводные», рекламный кабинет). Не додумывай гео, определение заявки, бюджеты и экономику сделки.
- Цифры приводи с валютой и периодом. Если данные брифа и кабинета расходятся — покажи расхождение, не выбирай молча одно из двух.
- Ты не меняешь рекламу и настройки: можешь предложить, что сделать, но делает это человек.`;

export const askConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  author: string | null;
  at: string;
}

export async function listChat(projectId: string, limit = 30): Promise<ChatTurn[]> {
  const rows = await getDb().select().from(projectChat).where(eq(projectChat.projectId, projectId)).orderBy(desc(projectChat.createdAt)).limit(limit);
  return rows.reverse().map((r) => ({ id: r.id, role: r.role, content: r.content, author: r.author, at: r.createdAt.toISOString() }));
}

/** Questions and API cost of the current calendar month — shown next to the box. */
export async function chatUsage(projectId: string) {
  const monthStart = new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
  const [row] = await getDb()
    .select({ n: sql<number>`count(*) filter (where ${projectChat.role} = 'user')`, cost: sql<number>`coalesce(sum(${projectChat.costUsd}), 0)` })
    .from(projectChat)
    .where(and(eq(projectChat.projectId, projectId), gte(projectChat.createdAt, monthStart)));
  return { questions: Number(row?.n ?? 0), costUsd: Number(row?.cost ?? 0) };
}

async function projectKnowledge(projectId: string) {
  const project = await getProject(projectId);
  if (!project) return null;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [brief, campaigns, log] = await Promise.all([
    getBrief(projectId),
    getDb()
      .select({
        platform: adMetricsDaily.platform,
        campaign: adMetricsDaily.campaignName,
        spend: sql<number>`round(sum(${adMetricsDaily.spend})::numeric, 2)`,
        impressions: sql<number>`sum(${adMetricsDaily.impressions})`,
        clicks: sql<number>`sum(${adMetricsDaily.clicks})`,
        leads: sql<number>`round(sum(${adMetricsDaily.leads})::numeric, 1)`,
        subscribers: sql<number>`round(sum(${adMetricsDaily.subscribers})::numeric, 1)`,
      })
      .from(adMetricsDaily)
      .where(and(eq(adMetricsDaily.projectId, projectId), gte(adMetricsDaily.date, since)))
      .groupBy(adMetricsDaily.platform, adMetricsDaily.campaignName)
      .orderBy(sql`sum(${adMetricsDaily.spend}) desc`)
      .limit(60),
    listLog(projectId, undefined, 40),
  ]);
  const briefText = brief ? briefAsText(brief) : "";
  const parts = [
    `# Проект «${project.name}»`,
    `Сегодня ${new Date().toISOString().slice(0, 10)}. В работе с ${project.startDate}. Валюта: ${project.agent.currency ?? "не задана"}.`,
    "## Карточка, план и цифры текущего месяца (из дашборда)",
    JSON.stringify(buildProjectContext(project), null, 1),
    "## Настройки для агента («Вводные»)",
    JSON.stringify(project.agent, null, 1),
    "## Планы по месяцам",
    JSON.stringify(project.plans, null, 1),
    "## Кампании за последние 30 дней (рекламные кабинеты)",
    campaigns.length ? JSON.stringify(campaigns, null, 1) : "Данных из рекламных кабинетов за 30 дней нет.",
    "## Бриф клиента",
    briefText || "Бриф не заполнен.",
    "## Лог проекта (последние записи)",
    log.length
      ? log.map((l) => `— [${l.updatedAt.toISOString().slice(0, 10)}, ${l.area}, ${l.kind}, ${l.status}] ${l.title}${l.body ? `\n${l.body}` : ""}`).join("\n")
      : "Записей нет.",
  ];
  return parts.join("\n\n");
}

/** Stores the question, asks the model, stores and returns the answer. */
export async function askProject(projectId: string, question: string, author: string): Promise<ChatTurn[]> {
  const text = question.trim().slice(0, MAX_QUESTION);
  if (!text) throw new Error("Напишите вопрос.");
  const db = getDb();
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [today] = await db
    .select({ n: sql<number>`count(*)` })
    .from(projectChat)
    .where(and(eq(projectChat.projectId, projectId), eq(projectChat.role, "user"), gte(projectChat.createdAt, dayAgo)));
  if (Number(today?.n ?? 0) >= ASK_DAILY_LIMIT) throw new Error(`Лимит ${ASK_DAILY_LIMIT} вопросов в сутки по проекту исчерпан.`);

  const knowledge = await projectKnowledge(projectId);
  if (!knowledge) throw new Error("Проект не найден.");
  const history = (await listChat(projectId, HISTORY_TURNS)).map((t) => ({ role: t.role, content: t.content }));
  // The API wants the conversation to start with a user turn.
  while (history.length && history[0].role !== "user") history.shift();

  const client = new Anthropic();
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SYSTEM },
        // The project's knowledge is the same for follow-up questions: cached, so they cost a fraction.
        { type: "text", text: knowledge, cache_control: { type: "ephemeral" } },
      ],
      messages: [...history, { role: "user", content: text }],
    })
    .finalMessage();

  if (response.stop_reason === "refusal") throw new Error("Модель отказалась отвечать на этот вопрос.");
  const answer = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  if (!answer) throw new Error("Пустой ответ. Попробуйте ещё раз.");
  const u = response.usage;
  const costUsd =
    ((u.input_tokens ?? 0) * PRICE.input +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (u.output_tokens ?? 0) * PRICE.output) /
    1_000_000;

  const now = Date.now();
  const rows = [
    { id: crypto.randomUUID(), projectId, role: "user" as const, content: text, author, costUsd: null, createdAt: new Date(now) },
    { id: crypto.randomUUID(), projectId, role: "assistant" as const, content: answer, author: null, costUsd, createdAt: new Date(now + 1) },
  ];
  await db.insert(projectChat).values(rows);
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, author: r.author, at: r.createdAt.toISOString() }));
}
