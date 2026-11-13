"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/icons/nav-icons";
import { Logo } from "@/components/ui/logo";
import { APP_CONFIG } from "@/config/app";
import { isNavItemActive, type NavItem, type SubNavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";

export function Sidebar({ items }: { items: NavItem[] }) {
  const main = items.filter((item) => !item.footer);
  const footer = items.filter((item) => item.footer);

  return (
    <aside className="glass hidden shrink-0 flex-col overflow-hidden rounded-[26px] text-sidebar-foreground backdrop-blur-xl lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-1.5rem)] lg:w-[248px]">
      <Link href="/" className="px-6 pt-6" aria-label={APP_CONFIG.name}>
        <Logo className="w-[148px]" />
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 px-3 pt-5" aria-label="Навигация">
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {main.map((item) => (
            <div key={item.href} className="flex flex-col gap-0.5">
              <NavLink item={item} />
              {item.children && item.children.length > 1 ? <SubLinks items={item.children} /> : null}
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
  const isActive =
    item.href === "/" ? pathname === "/" : pathname === item.href;

  return (
    <Link
      href={item.href}
      title={item.label}
      className={cn(
        "flex items-center gap-3 rounded-full px-3 py-2.5 text-[14px] font-medium tracking-[-0.01em] transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : isNavItemActive(item.href, pathname)
            ? "bg-sidebar-hover text-sidebar-foreground"
            : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
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
