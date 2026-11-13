"use server";

import { refresh } from "next/cache";
import { isAdminEmail } from "@/lib/access/admins";
import { isValidEmail, manageableRoles, normalizeEmail } from "@/lib/access/policy";
import { isAssignableRole } from "@/lib/access/roles";
import { deleteGrant, saveGrant } from "@/lib/access/store";
import { requireAccessManager, type Viewer } from "@/lib/access/viewer";
import { getProjects } from "@/lib/data";

export interface AccessActionState {
  ok: boolean;
  message: string | null;
}

async function checkTarget(actor: Viewer, email: string): Promise<string | null> {
  if (!isValidEmail(email)) return "Введите корректную почту.";
  if (isAdminEmail(email)) return "Доступ администратора нельзя изменить или отозвать.";
  if (email === actor.email) return "Свой уровень доступа изменить нельзя.";

  if (manageableRoles(actor.permissions.role).length === 0) {
    return "У вас нет прав управлять доступами.";
  }
  return null;
}

export async function saveGrantAction(
  _prev: AccessActionState,
  formData: FormData,
): Promise<AccessActionState> {
  const actor = await requireAccessManager();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = formData.get("role");

  const targetError = await checkTarget(actor, email);
  if (targetError) return { ok: false, message: targetError };

  if (!isAssignableRole(role) || !manageableRoles(actor.permissions.role).includes(role)) {
    return { ok: false, message: "Этот уровень доступа вам недоступен." };
  }

  let projectIds: string[] | null = null;
  if (formData.get("projectsMode") === "selected") {
    const knownIds = new Set((await getProjects()).map((p) => p.id));
    projectIds = formData
      .getAll("projectIds")
      .map(String)
      .filter((id) => knownIds.has(id));
    if (projectIds.length === 0) return { ok: false, message: "Выберите хотя бы один проект." };
  }

  const grant = { email, role, projectIds };

  await saveGrant(grant, actor.email);
  refresh();
  return { ok: true, message: `Доступ для ${email} сохранён.` };
}

export async function revokeGrantAction(email: string): Promise<AccessActionState> {
  const actor = await requireAccessManager();
  const target = normalizeEmail(email);

  const targetError = await checkTarget(actor, target);
  if (targetError) return { ok: false, message: targetError };

  await deleteGrant(target);
  refresh();
  return { ok: true, message: `Доступ для ${target} отозван.` };
}
