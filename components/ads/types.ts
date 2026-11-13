export const CREATIVE_FORMATS = ["Видео 9:16", "Квадрат 1:1", "Сторис 9:16", "Карусель", "Баннер 1.91:1"] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export const CREATIVE_STATUSES = ["Идея", "В работе", "На согласовании", "Готов"] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export interface Creative {
  id: string;
  name: string;
  format: CreativeFormat;
  status: CreativeStatus;
  hook: string;
  primaryText: string;
  headline: string;
  /** Uploaded file name; the file itself is not stored in demo mode. */
  fileName: string | null;
  hue: number;
  createdAt: string;
}

export interface CampaignDraft {
  id: string;
  name: string;
  platform: "meta" | "google";
  objective: string;
  budgetType: "daily" | "lifetime";
  budget: number;
  startDate: string;
  endDate: string;
  geo: string[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  audience: string;
  placements: "auto" | "manual";
  placementList: string[];
  creativeIds: string[];
  url: string;
  /** Google Search: responsive search ad texts, one per line in the form. */
  headlines?: string[];
  descriptions?: string[];
  /** draft = saved here; queued = waiting for an API; launched = created in the ad account. */
  status: "draft" | "queued" | "launched";
  externalId?: string | null;
  createdAt: string;
}

export function seedCreatives(projectName: string): Creative[] {
  const now = new Date().toISOString();
  return [
    {
      id: "seed-1",
      name: `${projectName} — квиз, UGC`,
      format: "Видео 9:16",
      status: "Готов",
      hook: "Пройди тест за 30 секунд и узнай…",
      primaryText: "Ответь на 5 вопросов — подберём решение под тебя и пришлём расчёт в мессенджер.",
      headline: "Пройти тест",
      fileName: "ugc_quiz_v3.mp4",
      hue: 24,
      createdAt: now,
    },
    {
      id: "seed-2",
      name: `${projectName} — оффер, статика`,
      format: "Квадрат 1:1",
      status: "На согласовании",
      hook: "−30% только до пятницы",
      primaryText: "Оставь заявку сегодня — зафиксируем цену и бонус к заказу.",
      headline: "Получить скидку",
      fileName: "offer_static_1x1.png",
      hue: 200,
      createdAt: now,
    },
    {
      id: "seed-3",
      name: `${projectName} — отзывы, карусель`,
      format: "Карусель",
      status: "В работе",
      hook: "Что говорят клиенты через месяц",
      primaryText: "Реальные отзывы и результаты — листай карусель.",
      headline: "Смотреть кейсы",
      fileName: null,
      hue: 140,
      createdAt: now,
    },
  ];
}
