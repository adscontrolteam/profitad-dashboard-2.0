"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { AdsIcon, NAV_ICONS, SmmIcon } from "@/components/icons/nav-icons";
import { Logo } from "@/components/ui/logo";
import { APP_CONFIG } from "@/config/app";
import { isNavItemActive, projectAreaOf, type NavItem, type SubNavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";
import type { ProjectArea, ProjectNavItem } from "./types";
import { useCurrentProject } from "./use-current-project";

const AREA_ICONS = { ads: AdsIcon, smm: SmmIcon };

export function Sidebar({
  items,
  projects,
  areas,
}: {
  items: NavItem[];
  projects: ProjectNavItem[];
  /** Реклама / SMM the viewer may open inside a project. */
  areas: ProjectArea[];
}) {
  const main = items.filter((item) => !item.footer);
  const footer = items.filter((item) => item.footer);

  return (
    <aside className="glass hidden shrink-0 flex-col overflow-hidden rounded-[26px] text-sidebar-foreground backdrop-blur-xl lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-1.5rem)] lg:w-[248px]">
      <Link href="/profile" className="px-6 pt-6" aria-label={APP_CONFIG.name}>
        <Logo className="w-[148px]" />
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 px-3 pt-5" aria-label="Навигация">
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {main.map((item) => (
            <div key={item.href} className="flex flex-col gap-0.5">
              <NavLink item={item} />
              {item.href === "/projects" ? (
                <Suspense fallback={null}>
                  <ProjectTree projects={projects} areas={areas} />
                </Suspense>
              ) : item.children && item.children.length > 1 ? (
                <SubLinks items={item.children} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3 pb-4">
          {footer.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const Icon = NAV_ICONS[item.href];
  const inSection = isNavItemActive(item.href, pathname);
  // «Проекты» has no page of its own: it is the whole section, so it stays lit inside any project.
  const isActive = item.href === "/projects" ? inSection : pathname === item.href;

  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "flex items-center gap-3 rounded-full px-3 py-2.5 text-[14px] font-medium tracking-[-0.01em] transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : inSection
            ? "bg-sidebar-hover text-sidebar-foreground"
            : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** Projects under «Проекты»; the open project shows its own Реклама and SMM. */
function ProjectTree({ projects, areas }: { projects: ProjectNavItem[]; areas: ProjectArea[] }) {
  const pathname = usePathname();
  const current = useCurrentProject(projects);
  if (!isNavItemActive("/projects", pathname)) return null;
  const area = projectAreaOf(pathname);

  return (
    <ul className="flex flex-col gap-0.5 pl-6">
      {projects.map((project) => {
        const open = project.id === current?.id;
        return (
          <li key={project.id} className="flex flex-col gap-0.5">
            <Link
              href={`/projects/${project.id}`}
              aria-current={open && !area ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
                open && !area
                  ? "bg-accent text-accent-foreground"
                  : open
                    ? "bg-sidebar-hover text-sidebar-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
              )}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-current opacity-50" />
              <span className="truncate">{project.name}</span>
            </Link>
            {open && areas.length > 0 && (
              <ul className="flex flex-col gap-0.5 pl-5">
                {areas.map((a) => {
                  const Icon = AREA_ICONS[a.key];
                  const active = area?.key === a.key;
                  return (
                    <li key={a.key}>
                      <Link
                        href={`${a.href}?p=${project.id}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium tracking-[-0.01em] transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                        )}
                      >
                        <Icon className="size-[15px] shrink-0" />
                        <span className="truncate">{a.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SubLinks({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();
  const parent = items[0]?.href ?? "";
  if (!pathname.startsWith(parent)) return null;

  return (
    <ul className="flex flex-col gap-0.5 pl-6">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
              )}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-current opacity-50" />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
