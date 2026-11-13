import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

/**
 * «Дирижёр» — role of the agent team that owns the project passport (agent repo docs/roles/dirijor.md,
 * dogovor.md §2). Here it turns a free-form brief into the passport + project fields and asks for what is
 * missing. It never invents geo, the lead definition or deal economics: those become questions.
 */

const MODEL = "claude-opus-5-5";

export const BriefAnalysisSchema = z.object({
  passport: z.object({
    business: z.string().describe("Чем занимается клиент и что продаёт. Пусто, если не сказано."),
    offer: z.string().describe("Оффер для рекламы: что именно предлагаем и на каких условиях."),
    audience: z.string().describe("Кому продаём: сегменты, боли, языки."),
    geo: z.array(z.string()).describe("Гео показа: страны/города. Пусто, если не сказано."),
    leadDefinition: z.string().describe("Что считается заявкой (форма, звонок, мессенджер...). Только со слов клиента."),
    economics: z.string().describe("Экономика сделки: средний чек, маржа, доля закрытия. Только со слов клиента."),
    landingUrl: z.string().describe("Сайт или посадочная страница."),
    channels: z.array(z.string()).describe("Каналы: Google Ads, Meta Ads, TikTok, SMM..."),
    constraints: z.string().describe("Ограничения: что нельзя, юридические рамки, стоп-слова."),
    history: z.string().describe("Что уже пробовали и с каким результатом."),
  }),
  fields: z.object({
    goal: z.string().describe("Короткая подпись основной цели проекта, 2-6 слов. Например: «Лиды на консультацию»."),
    resultMetric: z.enum(["leads", "subscribers", "sales", "revenue"]).describe("Главный результат проекта."),
    resultPlan: z.number().nullable().describe("Сколько результатов в месяц. null, если не сказано."),
    cpaPlan: z.number().nullable().describe("Предельная цена одного результата. null, если не сказано."),
    budgetMonth: z.number().nullable().describe("Рекламный бюджет в месяц. null, если не сказано."),
    currency: z.string().nullable().describe("Валюта, трёхбуквенный код ISO (EUR, USD, PLN, UAH). null, если не сказано."),
  }),
  briefMarkdown: z
    .string()
    .describe("Структурированный бриф для поля «Заметки»: короткие разделы с заголовками, только факты клиента, без воды."),
  questions: z
    .array(
      z.object({
        topic: z.string().describe("Тема: гео, заявка, экономика, цель, бюджет, оффер, аудитория, посадочная..."),
        question: z.string().describe("Один конкретный вопрос клиенту/менеджеру."),
        why: z.string().describe("Зачем это нужно для запуска, одной фразой."),
      }),
    )
    .describe("Чего не хватает для запуска. Самое важное — первым. Пусто, если паспорт полный."),
  readyToLaunch: z.boolean().describe("true, только если есть цель (объём и цена), гео, определение заявки и посадочная."),
});

export type BriefAnalysis = z.infer<typeof BriefAnalysisSchema>;

const SYSTEM = `Ты — Дирижёр команды AI-агентов рекламного агентства PROFITAD. Ты отвечаешь за то, чтобы проект пришёл к цели месяца, и сам составляешь паспорт проекта: бриф и цель. Исполнители (медиабайер Google, медиабайер Meta, контент) паспорт только принимают и без него задачу на сборку не берут.

Задача сейчас: из свободного текста брифа собрать паспорт проекта и поля карточки, а всё, чего не хватает для запуска, превратить в вопросы.

Правила:
- Пиши по-русски, коротко и по делу.
- Только факты из брифа и ответов. Не додумывай гео, определение заявки и экономику сделки: каждая такая подстановка уже стоила денег. Если этого нет — оставь поле пустым и задай вопрос.
- Цель — это два числа: сколько результатов в месяц и предельная цена результата. Если есть только одно из них или ни одного — вопрос. Если есть бюджет и цена, объём не вычисляй сам: спроси, это решение клиента.
- Валюту ставь, только если она названа или однозначно следует из текста (суммы в злотых → PLN).
- Вопросы — только то, без чего нельзя запускаться или что сильно меняет настройку. Не больше 7, самые важные первыми. Каждый вопрос — один, конкретный, на который можно ответить одной строкой.
- Если в разделе «Ответы» человек уже ответил на вопрос, используй ответ и вопрос больше не задавай.
- briefMarkdown — аккуратный бриф для команды: разделы «Бизнес», «Оффер», «Аудитория», «Гео», «Что считаем заявкой», «Экономика», «Посадочная», «Каналы», «Ограничения», «История». Пустые разделы не выводи.`;

export function conductorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function analyzeBrief(input: {
  projectName: string;
  brief: string;
  answers: { question: string; answer: string }[];
  current: { goal: string; currency: string | null; budgetMonth: number | null; leadActions: string[] };
}): Promise<BriefAnalysis> {
  const client = new Anthropic();
  const answered = input.answers.filter((a) => a.answer.trim());
  const userText = [
    `Проект: ${input.projectName || "без названия"}`,
    `Сейчас в карточке: цель «${input.current.goal || "—"}», валюта ${input.current.currency ?? "—"}, бюджет ${input.current.budgetMonth ?? "—"}, конверсии-заявки в Google Ads: ${input.current.leadActions.join(", ") || "не выбраны"}.`,
    "",
    "Бриф:",
    input.brief.trim(),
    ...(answered.length ? ["", "Ответы на твои прошлые вопросы:", ...answered.map((a) => `- ${a.question}\n  Ответ: ${a.answer.trim()}`)] : []),
  ].join("\n");

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(BriefAnalysisSchema) },
    messages: [{ role: "user", content: userText }],
  });

  if (response.stop_reason === "refusal") throw new Error("Модель отказалась разбирать этот бриф.");
  if (response.stop_reason === "max_tokens") throw new Error("Бриф слишком длинный: ответ не поместился.");
  if (!response.parsed_output) throw new Error("Дирижёр вернул ответ не по схеме. Попробуйте ещё раз.");
  return response.parsed_output;
}
