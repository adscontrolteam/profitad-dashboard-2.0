export const SECTIONS = ["dashboard", "analysis", "inputs", "sales", "tasks"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  dashboard: "Дашборд",
  analysis: "Анализ",
  inputs: "Вводные",
  sales: "Sales",
  tasks: "Task Manager",
};

export const ROLES = ["admin", "project_manager", "marketer", "reader", "custom"] as const;
export type Role = (typeof ROLES)[number];

/** Admin comes from the ADMIN_EMAILS env var and can never be granted or revoked in the app. */
export const ASSIGNABLE_ROLES = ["project_manager", "marketer", "reader", "custom"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  admin: {
    label: "Admin",
    description: "Полный доступ. Управляет доступами всех, включая Project Manager. Нельзя изменить или отозвать.",
  },
  project_manager: {
    label: "Project Manager",
    description: "Доступ ко всему. Управляет доступами Marketer, Reader и кастомными.",
  },
  marketer: { label: "Marketer", description: "Доступ ко всему, кроме Sales." },
  reader: { label: "Reader", description: "Как Marketer, но без редактирования «Вводных»." },
  custom: { label: "Кастомный", description: "Только выбранные вкладки и проекты." },
};

export interface AccessGrant {
  email: string;
  role: AssignableRole;
  sections: Section[];
  /** null = all projects */
  projectIds: string[] | null;
  canEditInputs: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface Permissions {
  role: Role;
  sections: Section[];
  projects: "all" | string[];
  canEditInputs: boolean;
  canManageAccess: boolean;
}

export const isSection = (value: unknown): value is Section =>
  SECTIONS.includes(value as Section);

export const isAssignableRole = (value: unknown): value is AssignableRole =>
  ASSIGNABLE_ROLES.includes(value as AssignableRole);
