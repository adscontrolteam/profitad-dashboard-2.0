import type { Permissions, Section } from "@/lib/access/roles";

export type AppRoute = "/profile" | "/" | "/projects" | "/inputs" | "/sales" | "/tasks" | "/finance" | "/settings";

export type Capability = "canManageAds" | "canPublishContent";

export interface SubNavItem {
  label: string;
  href: string;
  /** Extra permission on top of the parent section. */
  capability?: Capability;
}

export interface NavItem {
  label: string;
  href: AppRoute;
  /** Access section guarding this item; items without one are open to every signed-in user. */
  section?: Section;
  /** Pinned to the bottom of the sidebar. */
  footer?: boolean;
  children?: SubNavItem[];
}

export const ADS_TABS: SubNavItem[] = [
  { label: "Аналитика", href: "/ads" },
  { label: "Лиды", href: "/ads/leads" },
  { label: "Сборка кампаний", href: "/ads/campaigns", capability: "canManageAds" },
  { label: "Креативы", href: "/ads/creatives", capability: "canManageAds" },
];

export const SMM_TABS: SubNavItem[] = [
  { label: "Аналитика", href: "/smm" },
  { label: "Создание контента", href: "/smm/content", capability: "canPublishContent" },
  { label: "Постинг", href: "/smm/posting", capability: "canPublishContent" },
];

/** Financial is the admin's alone: only the admin role has the «finance» section. */
export const FINANCE_TABS: SubNavItem[] = [
  { label: "Обзор", href: "/finance" },
  { label: "Клиенты и оплаты", href: "/finance/clients" },
  { label: "Зарплаты", href: "/finance/payroll" },
  { label: "Расходы и план", href: "/finance/expenses" },
];

export const NAV_ITEMS: NavItem[] = [
  { label: "Профиль", href: "/profile" },
  { label: "Дашборд", href: "/", section: "dashboard" },
  // Реклама and SMM live inside a project: the sidebar opens them under the chosen project.
  { label: "Проекты", href: "/projects", section: "dashboard" },
  { label: "Вводные", href: "/inputs", section: "inputs" },
  { label: "Sales", href: "/sales", section: "sales" },
  { label: "Task Manager", href: "/tasks", section: "tasks" },
  { label: "Financial", href: "/finance", section: "finance", children: FINANCE_TABS },
  { label: "Настройки", href: "/settings", footer: true },
];

export const allowedTabs = (tabs: SubNavItem[], p: Pick<Permissions, Capability>) =>
  tabs.filter((tab) => !tab.capability || p[tab.capability]);

const EXTRA_TITLES: Record<string, string> = {
  "/settings/access": "Доступы",
  "/settings/integrations": "Подключения",
  "/finance/invoices/new": "Новый инвойс",
};

/** Order used for page slide direction. */
export const ROUTE_ORDER: AppRoute[] = NAV_ITEMS.map((item) => item.href);

const under = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Pages of one project: its main page, Реклама and SMM. */
export const PROJECT_AREAS = [
  { key: "ads", label: "Реклама", href: "/ads", section: "ads", tabs: ADS_TABS },
  { key: "smm", label: "SMM", href: "/smm", section: "smm", tabs: SMM_TABS },
] as const;

export const projectAreaOf = (pathname: string) => PROJECT_AREAS.find((a) => under(a.href, pathname)) ?? null;

export function isNavItemActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/projects") return under("/projects", pathname) || projectAreaOf(pathname) !== null;
  return under(href, pathname);
}

export function routeIndex(pathname: string) {
  const index = ROUTE_ORDER.findIndex((href) => isNavItemActive(href, pathname));
  return index === -1 ? 0 : index;
}

export function getPageTitle(pathname: string, projects: { id: string; name: string }[]) {
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  if (projectMatch) {
    return projects.find((p) => p.id === projectMatch[1])?.name ?? "Проект";
  }
  const area = projectAreaOf(pathname);
  if (area) return area.label;
  return NAV_ITEMS.find((item) => isNavItemActive(item.href, pathname))?.label ?? "";
}
