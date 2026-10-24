import type { Section } from "@/lib/access/roles";

export type AppRoute = "/" | "/analysis" | "/inputs" | "/sales" | "/tasks" | "/settings";

export interface NavItem {
  label: string;
  href: AppRoute;
  /** Access section guarding this item; items without one are open to every signed-in user. */
  section?: Section;
  /** Pinned to the bottom of the sidebar. */
  footer?: boolean;
  /** Renders the project list under this item. */
  withProjects?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Дашборд", href: "/", section: "dashboard" },
  { label: "Анализ", href: "/analysis", section: "analysis", withProjects: true },
  { label: "Вводные", href: "/inputs", section: "inputs" },
  { label: "Sales", href: "/sales", section: "sales" },
  { label: "Task Manager", href: "/tasks", section: "tasks" },
  { label: "Настройки", href: "/settings", footer: true },
];

const EXTRA_TITLES: Record<string, string> = {
  "/settings/access": "Доступы",
};

/** Order used for page slide direction. */
export const ROUTE_ORDER: AppRoute[] = NAV_ITEMS.map((item) => item.href);

export function isNavItemActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function routeIndex(pathname: string) {
  const index = ROUTE_ORDER.findIndex((href) => isNavItemActive(href, pathname));
  return index === -1 ? 0 : index;
}

export function getPageTitle(pathname: string, projects: { id: string; name: string }[]) {
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];
  const projectMatch = pathname.match(/^\/analysis\/([^/]+)/);
  if (projectMatch) {
    return projects.find((p) => p.id === projectMatch[1])?.name ?? "Проект";
  }
  return NAV_ITEMS.find((item) => isNavItemActive(item.href, pathname))?.label ?? "";
}
