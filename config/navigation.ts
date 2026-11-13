import type { Permissions, Section } from "@/lib/access/roles";

export type AppRoute = "/profile" | "/" | "/ads" | "/smm" | "/inputs" | "/sales" | "/tasks" | "/settings";

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
  { label: "Сборка кампаний", href: "/ads/campaigns", capability: "canManageAds" },
  { label: "Креативы", href: "/ads/creatives", capability: "canManageAds" },
];

export const SMM_TABS: SubNavItem[] = [
  { label: "Аналитика", href: "/smm" },
  { label: "Создание контента", href: "/smm/content", capability: "canPublishContent" },
  { label: "Постинг", href: "/smm/posting", capability: "canPublishContent" },
];

export const NAV_ITEMS: NavItem[] = [
  { label: "Профиль", href: "/profile" },
  { label: "Дашборд", href: "/", section: "dashboard" },
  { label: "Реклама", href: "/ads", section: "ads", children: ADS_TABS },
  { label: "SMM", href: "/smm", section: "smm", children: SMM_TABS },
  { label: "Вводные", href: "/inputs", section: "inputs" },
  { label: "Sales", href: "/sales", section: "sales" },
  { label: "Task Manager", href: "/tasks", section: "tasks" },
  { label: "Настройки", href: "/settings", footer: true },
];

export const allowedTabs = (tabs: SubNavItem[], p: Pick<Permissions, Capability>) =>
  tabs.filter((tab) => !tab.capability || p[tab.capability]);

const EXTRA_TITLES: Record<string, string> = {
  "/settings/access": "Доступы",
};

/** Order used for page slide direction. */
export const ROUTE_ORDER: AppRoute[] = NAV_ITEMS.map((item) => item.href);

export function isNavItemActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/projects/");
  return pathname === href || pathname.startsWith(`${href}/`);
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
  return NAV_ITEMS.find((item) => isNavItemActive(item.href, pathname))?.label ?? "";
}
