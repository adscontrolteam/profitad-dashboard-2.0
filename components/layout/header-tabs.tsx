"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isNavItemActive, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

/** Selection carried between the sub-tabs of a section. */
const KEPT_PARAMS = ["p", "range"];

/** Sub-tabs of the current section (Аналитика / Сборка кампаний / …), shown in the top bar on desktop. */
export function HeaderTabs({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = items.find((item) => item.children && isNavItemActive(item.href, pathname));
  const tabs = section?.children ?? [];
  if (tabs.length < 2) return null;

  const kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value = searchParams.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();

  return (
    <nav aria-label="Разделы" className={cn("min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]", className)}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={query ? `${tab.href}?${query}` : tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium tracking-[-0.01em] transition-colors",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
