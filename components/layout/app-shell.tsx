"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { getPageTitle, NAV_ITEMS, type AppRoute } from "@/config/navigation";
import { MobileTabBar } from "./mobile-tab-bar";
import { PageTransition } from "./page-transition";
import { Sidebar } from "./sidebar";
import type { ProjectNavItem } from "./types";

export function AppShell({
  children,
  projects,
  routes,
  roleLabel,
}: {
  children: React.ReactNode;
  projects: ProjectNavItem[];
  /** Routes the viewer may open. */
  routes: AppRoute[];
  roleLabel: string;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => routes.includes(item.href));

  return (
    <>
      <div className="flex h-dvh overflow-hidden bg-background lg:gap-3 lg:p-3">
        <Sidebar items={items} projects={projects} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:static lg:mb-3 lg:h-14 lg:rounded-full lg:border lg:bg-[var(--glass)] lg:px-5 lg:pt-0 lg:backdrop-blur-sm">
            <h1 className="min-w-0 truncate text-base font-bold tracking-[-0.02em] sm:text-lg lg:text-[22px]">
              {getPageTitle(pathname, projects)}
            </h1>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden rounded-full bg-muted px-3 py-1 text-xs font-semibold tracking-[-0.01em] text-muted-foreground sm:inline">
                {roleLabel}
              </span>
              <UserButton />
            </div>
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip px-3 pt-3 pb-[calc(6.25rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 lg:px-2 lg:pt-0 lg:pb-3">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
      <MobileTabBar items={items} />
    </>
  );
}
