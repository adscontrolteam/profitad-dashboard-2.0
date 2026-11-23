/** Meta action types → the project's results. Pure, shared by the sync and the project form. */

/** Readable names of the common Meta action types. */
export const META_ACTION_LABELS: Record<string, string> = {
  lead: "Лиды (все: формы Meta + сайт)",
  "onsite_conversion.lead_grouped": "Лид-форма Meta",
  onsite_web_lead: "Лиды с сайта (форма на сайте)",
  "offsite_conversion.fb_pixel_lead": "Лиды на сайте (пиксель)",
  like: "Отметки «Нравится» страницы",
  instagram_profile_follow: "Подписки на Instagram (с рекламы)",
  follow: "Подписки",
  "onsite_conversion.messaging_conversation_started_7d": "Начатые переписки",
  "onsite_conversion.messaging_first_reply": "Первые ответы в переписке",
  "onsite_conversion.total_messaging_connection": "Новые контакты в переписке",
  contact_total: "Контакты",
  submit_application_total: "Отправленные заявки",
  schedule_total: "Записи на приём",
  click_to_call_call_confirm: "Звонки",
  "offsite_conversion.fb_pixel_custom": "Своя конверсия пикселя",
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

/**
 * What a project may count as a lead — always offered, whether or not the account had such actions lately
 * (a new campaign has none yet). Pick one kind: «Лиды (все)» already contains the form and the site leads.
 */
export const META_LEAD_OPTIONS = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
  "onsite_conversion.total_messaging_connection",
  "complete_registration",
  "contact_total",
  "submit_application_total",
  "schedule_total",
  "click_to_call_call_confirm",
  "offsite_conversion.fb_pixel_custom",
];
/** The same for subscribers. */
export const META_SUBSCRIBER_OPTIONS = ["instagram_profile_follow", "like"];

export const metaActionLabel = (type: string) => META_ACTION_LABELS[type] ?? type;

/**
 * Leads without a choice: Meta's aggregated «lead» (forms + pixel); when the account reports only the parts,
 * the first one present.
 */
const LEAD_FALLBACK = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

export function countResult(actions: { action_type: string; value: string }[] | undefined, chosen: string[], fallback: string[] = []) {
  const by = new Map((actions ?? []).map((a) => [a.action_type, Number(a.value || 0)]));
  if (chosen.length) return chosen.reduce((sum, t) => sum + (by.get(t) ?? 0), 0);
  const first = fallback.find((t) => by.has(t));
  return first ? by.get(first)! : 0;
}

export const countLeads = (actions: { action_type: string; value: string }[] | undefined, chosen: string[]) => countResult(actions, chosen, LEAD_FALLBACK);
/** Subscribers without a choice: Instagram follows from ads, when Meta reports them. Nothing else is safe to guess. */
const SUBSCRIBER_FALLBACK = ["instagram_profile_follow"];
export const countSubscribers = (actions: { action_type: string; value: string }[] | undefined, chosen: string[]) => countResult(actions, chosen, SUBSCRIBER_FALLBACK);
