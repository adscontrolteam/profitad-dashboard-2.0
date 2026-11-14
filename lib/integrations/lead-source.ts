/**
 * Where a lead came from, for people: ads, an AI assistant, another tagged source, or SEO.
 * Reads what the lead sheet / CRM sync kept in `utm` (click ids, utm_source, referrer flags).
 */
export interface LeadSource {
  label: string;
  tone: "ads" | "ai" | "seo" | "other" | "unknown";
  hint: string;
}

const AI: [RegExp, string][] = [
  [/chatgpt|openai/i, "ChatGPT"],
  [/perplexity/i, "Perplexity"],
  [/gemini|bard/i, "Gemini"],
  [/claude|anthropic/i, "Claude"],
  [/copilot/i, "Copilot"],
];

const NAMES: [RegExp, string][] = [
  [/instagram|\big\b/i, "Instagram"],
  [/facebook|\bfb\b|meta/i, "Facebook"],
  [/telegram|\btg\b/i, "Telegram"],
  [/tiktok/i, "TikTok"],
  [/youtube/i, "YouTube"],
  [/linkedin/i, "LinkedIn"],
  [/bing/i, "Bing"],
  [/google/i, "Google"],
];

export function leadSource(utm: Record<string, string> | null | undefined): LeadSource {
  const u = utm ?? {};
  const source = (u.utm_source ?? "").trim();
  // A click id (gclid and the like) or a paid UTM medium: the lead came from ads.
  if (u.ad === "google") return { label: "Google Ads", tone: "ads", hint: u.gclid ? "есть gclid" : "платная UTM-метка" };
  if (u.ad === "meta") return { label: "Meta Ads", tone: "ads", hint: u.fbclid ? "есть fbclid" : "платная UTM-метка" };
  for (const [re, label] of AI) if (re.test(source) || re.test(u.referrer ?? "")) return { label, tone: "ai", hint: `utm_source: ${source || u.referrer}` };
  if (source) {
    const known = NAMES.find(([re]) => re.test(source))?.[1];
    return { label: known ?? source, tone: "other", hint: `utm_source: ${source}` };
  }
  // The site did not record click ids or UTM yet when this lead came in: ads cannot be told from SEO.
  if (u.untracked === "1") return { label: "нет меток", tone: "unknown", hint: "Лид пришёл до того, как сайт начал записывать метки" };
  if (u.google_ref === "1") return { label: "SEO", tone: "seo", hint: "Пришёл со страницы Google без клик-метки" };
  return { label: "SEO", tone: "seo", hint: "Нет ни клик-метки, ни utm_source" };
}
