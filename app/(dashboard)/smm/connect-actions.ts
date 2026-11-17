"use server";

import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { removeConnection, rotateConnectLink, type ConnectedNetwork } from "@/lib/social/store";

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
