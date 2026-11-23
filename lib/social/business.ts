import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, socialConnections } from "@/db/schema";
import { metaConfigured, metaList } from "@/lib/meta/ads";
import { listSocialAccounts, saveConnections, type NewConnection } from "./store";

/**
 * Pages and Instagram accounts of the agency Business Manager, read as its System User (META_SYSTEM_USER_TOKEN):
 * nobody signs in, and the access does not hang on a person's profile. The list is exactly what is assigned to the
 * System User in Business settings; the token needs pages_show_list, pages_read_engagement, read_insights,
 * instagram_basic and instagram_manage_insights.
 */
export const businessPagesConfigured = metaConfigured;

interface GraphPage {
  id: string;
  name: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
}

/** What the picker shows: never a token. */
export interface BusinessPageView {
  id: string;
  name: string;
  pictureUrl: string | null;
  instagram: string | null;
  /** Names of other projects that already use this Page. */
  usedBy: string[];
}

const HELP =
  "Проверьте в Business Manager: страницы назначены системному пользователю, а его токен выпущен с правами pages_show_list, pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights.";

async function fetchPages() {
  try {
    const pages = await metaList<GraphPage>("me/accounts", {
      fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
      limit: "100",
    });
    return pages.filter((p) => p.access_token);
  } catch (error) {
    throw new Error(`Meta не отдала страницы: ${(error as Error).message} ${HELP}`);
  }
}

export async function listBusinessPages(projectId: string): Promise<BusinessPageView[]> {
  const [pages, taken] = await Promise.all([
    fetchPages(),
    getDb()
      .select({ externalId: socialConnections.externalId, project: projects.name })
      .from(socialConnections)
      .innerJoin(projects, eq(projects.id, socialConnections.projectId))
      .where(and(eq(socialConnections.network, "facebook"), ne(socialConnections.projectId, projectId))),
  ]);
  if (!pages.length) throw new Error(`Системному пользователю не доступна ни одна страница. ${HELP}`);
  return pages
    .map((p) => ({
      id: p.id,
      name: p.name,
      pictureUrl: p.picture?.data?.url ?? null,
      instagram: p.instagram_business_account ? (p.instagram_business_account.username ? `@${p.instagram_business_account.username}` : "Instagram") : null,
      usedBy: taken.filter((t) => t.externalId === p.id).map((t) => t.project),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Stores the chosen Pages and the Instagram accounts linked to them in the project. Page tokens of a System User do not expire. */
export async function connectBusinessPages(projectId: string, pageIds: string[]) {
  const wanted = new Set(pageIds);
  const items: NewConnection[] = [];
  for (const p of await fetchPages()) {
    if (!wanted.has(p.id)) continue;
    items.push({ network: "facebook", externalId: p.id, name: p.name, pictureUrl: p.picture?.data?.url, token: p.access_token! });
    const ig = p.instagram_business_account;
    if (ig) items.push({ network: "instagram", externalId: ig.id, name: ig.username ? `@${ig.username}` : p.name, pictureUrl: ig.profile_picture_url, token: p.access_token! });
  }
  if (!items.length) throw new Error("Выбранные страницы больше не доступны системному пользователю.");
  await saveConnections(projectId, items);
  return { added: items, accounts: await listSocialAccounts(projectId) };
}
