export const SECTIONS = ["dashboard", "ads", "smm", "inputs", "sales", "tasks"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABELS: Record<Section, string> = {
  dashboard: "Дашборд",
  ads: "Реклама",
  smm: "SMM",
  inputs: "Вводные",
  sales: "Sales",
  tasks: "Task Manager",
};

export const ROLES = ["admin", "smm", "media_buyer", "sales"] as const;
export type Role = (typeof ROLES)[number];

/** Admin comes from the ADMIN_EMAILS env var and can never be granted or revoked in the app. */
export const ASSIGNABLE_ROLES = ["smm", "media_buyer", "sales"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  admin: {
    label: "Администратор",
    description: "Может всё: «Вводные», доступы, реклама, SMM, Sales. Нельзя изменить или отозвать.",
  },
  smm: {
    label: "SMM",
    description: "Создаёт и публикует контент, смотрит аналитику SMM и рекламы. Не собирает и не запускает рекламу.",
  },
  media_buyer: {
    label: "MediaBuyer",
    description: "Собирает и запускает рекламу, готовит креативы, смотрит аналитику рекламы и SMM. Не публикует контент.",
  },
  sales: {
    label: "Sales",
    description: "Смотрит результаты проектов, работает в Sales и Task Manager. Не публикует контент и не запускает рекламу.",
  },
};

export interface AccessGrant {
  email: string;
  /** null = a role from the old access model; the grant gives no access until a new role is assigned. */
  role: AssignableRole | null;
  /** The raw stored role, kept to show legacy grants. */
  storedRole: string;
  /** null = all projects */
  projectIds: string[] | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface Permissions {
  role: Role;
  sections: Section[];
  projects: "all" | string[];
  canEditInputs: boolean;
  canManageAccess: boolean;
  /** Build and launch ad campaigns, prepare creatives. */
  canManageAds: boolean;
  /** Create and publish social content. */
  canPublishContent: boolean;
}

export const isSection = (value: unknown): value is Section =>
  SECTIONS.includes(value as Section);

export const isAssignableRole = (value: unknown): value is AssignableRole =>
  ASSIGNABLE_ROLES.includes(value as AssignableRole);
