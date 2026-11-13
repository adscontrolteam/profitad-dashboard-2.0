import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { NAV_ITEMS } from "@/config/navigation";
import { isAdminEmail } from "./admins";
import { canViewProject, canViewSection, normalizeEmail, permissionsFor } from "./policy";
import type { Permissions, Section } from "./roles";
import { getGrant } from "./store";

export interface Viewer {
  email: string;
  name: string | null;
  permissions: Permissions;
}

type ViewerState =
  | { status: "signed-out" }
  | { status: "no-access"; email: string | null }
  | { status: "ok"; viewer: Viewer };

/** Resolves the signed-in user and their access. Deduped per request. */
export const getViewerState = cache(async (): Promise<ViewerState> => {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return { status: "signed-out" };

  const user = await currentUser();
  const primary = user?.primaryEmailAddress;
  if (!user || !primary || primary.verification?.status !== "verified") {
    return { status: "no-access", email: primary?.emailAddress ?? null };
  }

  const email = normalizeEmail(primary.emailAddress);
  const name = user.fullName || user.firstName || null;

  if (isAdminEmail(email)) {
    return { status: "ok", viewer: { email, name, permissions: permissionsFor("admin") } };
  }

  const grant = await getGrant(email);
  if (!grant?.role) return { status: "no-access", email };

  return { status: "ok", viewer: { email, name, permissions: permissionsFor(grant.role, grant) } };
});

export async function requireViewer(): Promise<Viewer> {
  const state = await getViewerState();
  if (state.status === "signed-out") redirect("/sign-in");
  if (state.status === "no-access") redirect("/no-access");
  return state.viewer;
}

export function firstAllowedHref(p: Permissions) {
  return NAV_ITEMS.find((item) => !item.section || canViewSection(p, item.section))?.href ?? "/settings";
}

export async function requireSection(section: Section): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!canViewSection(viewer.permissions, section)) redirect(firstAllowedHref(viewer.permissions));
  return viewer;
}

export async function requireProject(projectId: string): Promise<Viewer> {
  const viewer = await requireSection("dashboard");
  if (!canViewProject(viewer.permissions, projectId)) notFound();
  return viewer;
}

/** For actions and sub-pages behind a capability rather than a whole section. */
export async function requireCapability(
  section: Section,
  capability: "canManageAds" | "canPublishContent" | "canEditInputs",
): Promise<Viewer> {
  const viewer = await requireSection(section);
  if (!viewer.permissions[capability]) redirect(`/${section}`);
  return viewer;
}

export async function requireAccessManager(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.permissions.canManageAccess) notFound();
  return viewer;
}
