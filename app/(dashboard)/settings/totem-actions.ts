"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { requireViewer } from "@/lib/access/viewer";
import { isTotemColor, isTotemKind } from "@/lib/team/totem-kinds";

/** Saves the viewer's totem kind and colour into their own Clerk profile (public metadata). */
export async function saveTotemAction(kind: string, color: string): Promise<{ ok: boolean; message: string }> {
  await requireViewer();
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "Войдите заново." };
  if (!isTotemKind(kind) || !isTotemColor(color)) return { ok: false, message: "Такого тотема нет." };
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { totem: { kind, color } } });
  refresh();
  return { ok: true, message: "Тотем сохранён." };
}
