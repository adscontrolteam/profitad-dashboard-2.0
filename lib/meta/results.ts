/** Meta action types → the project's results. Pure, shared by the sync and the project form. */

/** Readable names of the common Meta action types. */
export const META_ACTION_LABELS: Record<string, string> = {
  lead: "Лиды (все: формы Meta + сайт)",
  "onsite_conversion.lead_grouped": "Лиды из форм Meta",
  "offsite_conversion.fb_pixel_lead": "Лиды на сайте (пиксель)",
  like: "Отметки «Нравится» страницы",
  follow: "Подписки",
  "onsite_conversion.messaging_conversation_started_7d": "Начатые переписки",
  "onsite_conversion.messaging_first_reply": "Первые ответы в переписке",
  complete_registration: "Регистрации",
  "offsite_conversion.fb_pixel_complete_registration": "Регистрации на сайте (пиксель)",
  purchase: "Покупки",
  "offsite_conversion.fb_pixel_purchase": "Покупки на сайте (пиксель)",
  link_click: "Клики по ссылке",
  landing_page_view: "Просмотры целевой страницы",
  page_engagement: "Вовлечённость страницы",
  post_engagement: "Вовлечённость публикации",
  post_reaction: "Реакции",
  comment: "Комментарии",
  "onsite_conversion.post_save": "Сохранения публикации",
  video_view: "Просмотры видео (3 сек)",
};

export const metaActionLabel = (type: string) => META_ACTION_LABELS[type] ?? type;

/**
 * Leads without a choice: Meta's aggregated «lead» (forms + pixel); when the account reports only the parts,
 * the first one present. Subscribers have no safe default — the project chooses.
 */
const LEAD_FALLBACK = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

export function countResult(actions: { action_type: string; value: string }[] | undefined, chosen: string[], fallback: string[] = []) {
  const by = new Map((actions ?? []).map((a) => [a.action_type, Number(a.value || 0)]));
  if (chosen.length) return chosen.reduce((sum, t) => sum + (by.get(t) ?? 0), 0);
  const first = fallback.find((t) => by.has(t));
  return first ? by.get(first)! : 0;
}

export const countLeads = (actions: { action_type: string; value: string }[] | undefined, chosen: string[]) => countResult(actions, chosen, LEAD_FALLBACK);
export const countSubscribers = (actions: { action_type: string; value: string }[] | undefined, chosen: string[]) => countResult(actions, chosen);
