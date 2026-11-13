import type { SocialNetwork } from "@/lib/workspace/params";

export type PostStatus = "draft" | "scheduled" | "published" | "failed";
export type PostSource = "Вручную" | "Агент" | "Notion";

export interface SocialPost {
  id: string;
  network: SocialNetwork;
  account: string;
  /** Threads: every item is a part of the thread. Other networks: one caption. */
  parts: string[];
  /** YouTube title. */
  title: string;
  fileName: string | null;
  status: PostStatus;
  source: PostSource;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export const TEXT_LIMITS: Record<SocialNetwork, number> = {
  threads: 500,
  instagram: 2200,
  facebook: 5000,
  tiktok: 2200,
  youtube: 5000,
};

export const NEEDS_MEDIA: Record<SocialNetwork, boolean> = {
  threads: false,
  facebook: false,
  instagram: true,
  tiktok: true,
  youtube: true,
};

export const STATUS_META: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Запланирован", className: "bg-info/12 text-info" },
  published: { label: "Опубликован", className: "bg-positive/12 text-positive" },
  failed: { label: "Ошибка", className: "bg-negative/12 text-negative" },
};

export function demoAccounts(projectName: string, network: SocialNetwork) {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand";
  return network === "youtube" || network === "facebook"
    ? [`${projectName}`]
    : [`@${slug}`, `@${slug}.team`];
}

export const postTitle = (p: SocialPost) => p.title || p.parts[0]?.split("\n")[0]?.slice(0, 90) || "Без текста";

export function seedPosts(projectName: string): SocialPost[] {
  const at = (days: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const acc = (n: SocialNetwork) => demoAccounts(projectName, n)[0];
  return [
    {
      id: "seed-a",
      network: "threads",
      account: acc("threads"),
      parts: [
        "Threads открыл рекламу для всех стран — а вы ещё не зашли?",
        "Реклама в Threads управляется той же системой, что и в Facebook и Instagram — настройки подтягиваются автоматически.",
        "Пока конкуренция ниже, чем в Instagram, — окно возможностей для нашего рынка.",
      ],
      title: "",
      fileName: null,
      status: "draft",
      source: "Notion",
      scheduledAt: null,
      publishedAt: null,
      createdAt: at(0, 9),
    },
    {
      id: "seed-b",
      network: "instagram",
      account: acc("instagram"),
      parts: ["3 ошибки, которые сливают рекламный бюджет в первые 3 дня. Сохраняй, чтобы не потерять 👇"],
      title: "",
      fileName: "reel_budget_mistakes.mp4",
      status: "scheduled",
      source: "Агент",
      scheduledAt: at(1, 19),
      publishedAt: null,
      createdAt: at(0, 10),
    },
    {
      id: "seed-c",
      network: "tiktok",
      account: acc("tiktok"),
      parts: ["Как мы снизили цену лида в 2 раза за неделю #маркетинг #таргет"],
      title: "",
      fileName: "tt_cpl_case.mp4",
      status: "scheduled",
      source: "Вручную",
      scheduledAt: at(2, 12),
      publishedAt: null,
      createdAt: at(-1, 15),
    },
    {
      id: "seed-d",
      network: "facebook",
      account: acc("facebook"),
      parts: ["Новый кейс: квиз-воронка принесла 2 800 заявок по $1,06. Рассказываем, что сработало."],
      title: "",
      fileName: null,
      status: "published",
      source: "Вручную",
      scheduledAt: null,
      publishedAt: at(-1, 11),
      createdAt: at(-2, 11),
    },
    {
      id: "seed-e",
      network: "youtube",
      account: acc("youtube"),
      parts: ["Разбор рекламного кабинета за 60 секунд."],
      title: "Агент сам запустил рекламу — что вышло",
      fileName: "short_agent.mp4",
      status: "failed",
      source: "Агент",
      scheduledAt: at(-1, 18),
      publishedAt: null,
      createdAt: at(-2, 9),
    },
  ];
}
