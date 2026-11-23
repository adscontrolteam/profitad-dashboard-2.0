"use server";

import { headers } from "next/headers";
import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { ensureManychatToken, manychatStatus } from "@/lib/manychat/store";

/** The project's ManyChat address and whether anything has arrived. Only those who edit the inputs see the address: it is a secret. */
export async function manychatHookAction(projectId: string): Promise<{ ok: boolean; url?: string; count?: number; lastAt?: string | null }> {
  const viewer = await requireSection("inputs");
  if (!viewer.permissions.canEditInputs || !canViewProject(viewer.permissions, projectId)) return { ok: false };
  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const [token, status] = await Promise.all([ensureManychatToken(projectId), manychatStatus(projectId)]);
  return { ok: true, url: `${origin}/api/hooks/manychat/${token}`, ...status };
}
