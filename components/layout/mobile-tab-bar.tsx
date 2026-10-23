"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/icons/nav-icons";
import { isNavItemActive, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

export function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Навигация"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="glass pointer-events-auto mx-auto flex h-16 max-w-lg items-center justify-around rounded-full bg-card/90 px-2 shadow-[var(--shadow)] backdrop-blur-md">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.href];
          const isActive = isNavItemActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex size-12 items-center justify-center rounded-full transition-colors [-webkit-tap-highlight-color:transparent] touch-manipulation",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground active:bg-muted/70",
              )}
            >
              <Icon className="size-5" />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
