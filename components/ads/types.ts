export type CreativePlatform = "meta" | "google";

/** Meta: feed, stories, reels, carousel. */
export const META_FORMATS = ["Видео 9:16", "Квадрат 1:1", "Сторис 9:16", "Карусель", "Баннер 1.91:1"] as const;

/** Google: image and video assets for Performance Max, Demand Gen, Display and YouTube. */
export const GOOGLE_FORMATS = [
  "Горизонтальное 1.91:1",
  "Квадрат 1:1",
  "Вертикальное 4:5",
  "Логотип 1:1",
  "Видео YouTube 16:9",
  "Видео Shorts 9:16",
] as const;

export const CREATIVE_FORMATS = [...META_FORMATS, ...GOOGLE_FORMATS.filter((f) => f !== "Квадрат 1:1")] as const;
export type CreativeFormat = (typeof META_FORMATS)[number] | (typeof GOOGLE_FORMATS)[number];

/** Recommended sizes shown under the Google format select. */
export const GOOGLE_FORMAT_HINTS: Record<string, string> = {
  "Горизонтальное 1.91:1": "1200×628, обязательно для PMax и Демонстрационной сети",
  "Квадрат 1:1": "1200×1200, обязательно для PMax",
  "Вертикальное 4:5": "960×1200 — Demand Gen, Discover, Gmail",
  "Логотип 1:1": "1200×1200 (минимум 128×128), прозрачный или белый фон",
  "Видео YouTube 16:9": "от 10 сек, ссылка на YouTube или файл",
  "Видео Shorts 9:16": "до 60 сек, вертикальное — YouTube Shorts и PMax",
};

/** Google responsive search ad limits. */
export const RSA_LIMITS = { headlines: 15, headlineChars: 30, descriptions: 4, descriptionChars: 90, pathChars: 15 } as const;

export const CREATIVE_STATUSES = ["Идея", "В работе", "На согласовании", "Готов"] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export interface Creative {
  id: string;
  /** Missing on items saved before the split = Meta. */
  platform?: CreativePlatform;
  /** creative = image/video asset; ad = Google search ad texts (no file). */
  kind?: "creative" | "ad";
  /** Google search ad: up to 15 headlines (≤30) and 4 descriptions (≤90), display path. */
  headlines?: string[];
  descriptions?: string[];
  path1?: string;
  path2?: string;
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
