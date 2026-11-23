"use server";

import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { addLog } from "@/lib/log/store";
import { connectBusinessPages, listBusinessPages, type BusinessPageView } from "@/lib/social/business";
import { removeConnection, rotateConnectLink, type ConnectedNetwork, type SocialAccountView } from "@/lib/social/store";

/** The link and the connected accounts are managed by whoever edits the project's inputs (admins). */
async function guard(projectId: string) {
  const viewer = await requireSection("smm");
  return viewer.permissions.canEditInputs && canViewProject(viewer.permissions, projectId);
}

/** New link; the old one stops working. */
export async function rotateConnectLinkAction(projectId: string): Promise<{ ok: boolean; token?: string }> {
  if (!(await guard(projectId))) return { ok: false };
  return { ok: true, token: await rotateConnectLink(projectId) };
}

/** Forgets the account's token here. The client's permission in the network itself stays until they revoke it there. */
export async function disconnectSocialAction(projectId: string, network: ConnectedNetwork, externalId: string): Promise<{ ok: boolean }> {
  if (!(await guard(projectId))) return { ok: false };
  await removeConnection(projectId, network, externalId);
  return { ok: true };
}

/** Pages of our Business Manager the project can take without anyone signing in. */
export async function listBusinessPagesAction(projectId: string): Promise<{ ok: boolean; pages?: BusinessPageView[]; error?: string }> {
  if (!(await guard(projectId))) return { ok: false, error: "Нет прав." };
  try {
    return { ok: true, pages: await listBusinessPages(projectId) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function connectBusinessPagesAction(projectId: string, pageIds: string[]): Promise<{ ok: boolean; accounts?: SocialAccountView[]; error?: string }> {
  if (!(await guard(projectId))) return { ok: false, error: "Нет прав." };
  const ids = pageIds.filter((id) => /^\d{5,25}$/.test(id)).slice(0, 50);
  if (!ids.length) return { ok: false, error: "Не выбрано ни одной страницы." };
  try {
    const { added, accounts } = await connectBusinessPages(projectId, ids);
    await addLog(projectId, {
      area: "smm",
      kind: "info",
      status: "done",
      title: `Подключены соцсети из Business Manager: ${added.map((a) => `${a.network} ${a.name}`).join(", ")}`,
    }).catch(() => undefined);
    return { ok: true, accounts };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
