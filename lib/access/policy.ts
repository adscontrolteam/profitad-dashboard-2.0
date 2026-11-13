import {
  ASSIGNABLE_ROLES,
  SECTIONS,
  type AccessGrant,
  type AssignableRole,
  type Permissions,
  type Role,
  type Section,
} from "./roles";

const ROLE_SECTIONS: Record<Role, readonly Section[]> = {
  admin: SECTIONS,
  smm: ["dashboard", "ads", "smm", "tasks"],
  media_buyer: ["dashboard", "ads", "smm", "tasks"],
  sales: ["dashboard", "sales", "tasks"],
};

export function permissionsFor(role: Role, grant?: AccessGrant | null): Permissions {
  return {
    role,
    sections: [...ROLE_SECTIONS[role]],
    projects: role === "admin" ? "all" : (grant?.projectIds ?? "all"),
    canEditInputs: role === "admin",
    canManageAccess: role === "admin",
    canManageAds: role === "admin" || role === "media_buyer",
    canPublishContent: role === "admin" || role === "smm",
  };
}

/** Roles the actor may grant, edit or revoke. */
export function manageableRoles(actor: Role): AssignableRole[] {
  return actor === "admin" ? [...ASSIGNABLE_ROLES] : [];
}

export const canViewSection = (p: Permissions, section: Section) => p.sections.includes(section);

export const canViewProject = (p: Permissions, projectId: string) =>
  p.projects === "all" || p.projects.includes(projectId);

export function visibleProjects<T extends { id: string }>(p: Permissions, projects: T[]): T[] {
  return p.projects === "all" ? projects : projects.filter((project) => canViewProject(p, project.id));
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
