"use server";

import { revalidateTag } from "next/cache";
import { canViewProject } from "@/lib/access/policy";
import { requireCapability } from "@/lib/access/viewer";
import { audit } from "@/lib/audit";
import { getProject } from "@/lib/data";
import { TAGS } from "@/lib/data/tags";
import { GoogleApiError } from "@/lib/google/auth";
import { adsConfigured, createSearchCampaign, setCampaignStatus, type SearchCampaignSpec } from "@/lib/google/ads";

export interface AdsActionResult {
  ok: boolean;
  message: string;
  campaignId?: string | null;
}

const digits = (v: string) => v.replace(/\D/g, "");

/** The viewer may manage ads, sees the project, and the account is one of the project's Google sources. */
async function guard(projectId: string, accountId: string) {
  const viewer = await requireCapability("ads", "canManageAds");
  if (!canViewProject(viewer.permissions, projectId)) return { viewer, error: "Нет доступа к проекту." };
  const project = await getProject(projectId);
  const linked = project?.sources.some((s) => s.platform === "google" && digits(s.accountId) === digits(accountId));
  if (!linked) return { viewer, error: "Этот кабинет Google Ads не привязан к проекту во «Вводных»." };
  if (!adsConfigured()) return { viewer, error: "Google Ads API не настроен: см. «Настройки → Подключения»." };
  return { viewer, error: null };
}

const explain = (e: unknown) => (e instanceof GoogleApiError ? `Google Ads: ${e.message}` : e instanceof Error ? e.message : "Ошибка");

export async function setGoogleCampaignStatusAction(
  projectId: string,
  accountId: string,
  campaignId: string,
  status: "ENABLED" | "PAUSED",
): Promise<AdsActionResult> {
  const { viewer, error } = await guard(projectId, accountId);
  if (error) return { ok: false, message: error };
  const target = `${digits(accountId)}/${campaignId}`;
  try {
    await setCampaignStatus(accountId, campaignId, status);
    await audit({ actorEmail: viewer.email, action: `google.campaign.${status.toLowerCase()}`, projectId, target, ok: true });
    revalidateTag(TAGS.project(projectId), "max");
    return { ok: true, message: status === "PAUSED" ? "Кампания на паузе." : "Кампания включена." };
  } catch (e) {
    await audit({ actorEmail: viewer.email, action: `google.campaign.${status.toLowerCase()}`, projectId, target, ok: false, result: explain(e) });
    return { ok: false, message: explain(e) };
  }
}

const MAX = { headline: 30, description: 90, keyword: 80 };

export async function launchGoogleSearchAction(
  projectId: string,
  accountId: string,
  spec: SearchCampaignSpec,
  validateOnly: boolean,
): Promise<AdsActionResult> {
  const { viewer, error } = await guard(projectId, accountId);
  if (error) return { ok: false, message: error };

  const clean = (list: string[], max: number) => [...new Set(list.map((s) => s.trim()).filter(Boolean))].map((s) => s.slice(0, max));
  const payload: SearchCampaignSpec = {
    name: spec.name.trim().slice(0, 120),
    dailyBudget: Number(spec.dailyBudget),
    geo: spec.geo,
    keywords: clean(spec.keywords, MAX.keyword).slice(0, 200),
    headlines: clean(spec.headlines, MAX.headline).slice(0, 15),
    descriptions: clean(spec.descriptions, MAX.description).slice(0, 4),
    finalUrl: spec.finalUrl.trim(),
    enable: Boolean(spec.enable),
  };
  const problems = [
    !payload.name && "название",
    !(payload.dailyBudget > 0) && "дневной бюджет",
    payload.geo.length === 0 && "гео",
    payload.keywords.length === 0 && "ключевые слова",
    payload.headlines.length < 3 && "минимум 3 заголовка (до 30 символов)",
    payload.descriptions.length < 2 && "минимум 2 описания (до 90 символов)",
    !/^https?:\/\/\S+\.\S+/.test(payload.finalUrl) && "ссылка",
  ].filter(Boolean);
  if (problems.length) return { ok: false, message: `Не хватает: ${problems.join(", ")}.` };

  const action = validateOnly ? "google.campaign.validate" : "google.campaign.create";
  try {
    const result = await createSearchCampaign(accountId, payload, validateOnly);
    await audit({ actorEmail: viewer.email, action, projectId, target: `${digits(accountId)}/${result.campaignId ?? "-"}`, payload, ok: true });
    if (!validateOnly) revalidateTag(TAGS.project(projectId), "max");
    return {
      ok: true,
      campaignId: result.campaignId,
      message: validateOnly
        ? "Google проверил кампанию: ошибок нет, можно запускать."
        : payload.enable
          ? `Кампания «${payload.name}» создана и запущена.`
          : `Кампания «${payload.name}» создана на паузе.`,
    };
  } catch (e) {
    await audit({ actorEmail: viewer.email, action, projectId, target: digits(accountId), payload, ok: false, result: explain(e) });
    return { ok: false, message: explain(e) };
  }
}
