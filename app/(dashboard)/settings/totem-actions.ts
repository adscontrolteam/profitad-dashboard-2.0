"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { refresh } from "next/cache";
import { requireViewer } from "@/lib/access/viewer";
import { cleanTotemName, isTotemColor, isTotemKind } from "@/lib/team/totem-kinds";
import { normalizeUsername, setTeamTelegramUsername } from "@/lib/notify/team-telegram";

/** Saves the viewer's totem kind and colour into their own Clerk profile (public metadata). */
export async function saveTotemAction(kind: string, color: string, name = ""): Promise<{ ok: boolean; message: string }> {
  await requireViewer();
  const { userId } = await auth();
  if (!userId) return { ok: false, message: "Войдите заново." };
  if (!isTotemKind(kind) || !isTotemColor(color)) return { ok: false, message: "Такого тотема нет." };
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { totem: { kind, color, name: cleanTotemName(name) || null } } });
  refresh();
  return { ok: true, message: "Тотем сохранён." };
}

/** The viewer's own Telegram @username for personal notifications (admins have no grant to edit, so it is set here). */
export async function saveMyTelegramAction(raw: string): Promise<{ ok: boolean; message: string }> {
  const viewer = await requireViewer();
  const value = String(raw ?? "").trim();
  if (value && !normalizeUsername(value)) return { ok: false, message: "Укажите @username: латиница, цифры, _, от 5 символов." };
  const saved = await setTeamTelegramUsername(viewer.email, value || null);
  refresh();
  return { ok: true, message: saved ? "Сохранено. Теперь откройте бота и нажмите Start." : "Telegram отключён." };
}
