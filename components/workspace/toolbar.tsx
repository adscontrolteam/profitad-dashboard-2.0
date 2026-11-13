import Link from "next/link";
import { cn } from "@/lib/cn";
import { RANGES, workspaceHref } from "@/lib/workspace/params";

type Query = Record<string, string | undefined>;

export function PillTabs({
  items,
  label,
  className,
}: {
  items: { href: string; label: React.ReactNode; active: boolean; muted?: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none]",
        className,
      )}
    >
      {items.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium tracking-[-0.01em] transition-colors",
            tab.active
              ? "bg-accent text-accent-foreground"
              : tab.muted
                ? "text-muted-foreground/70 hover:bg-muted"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** Section sub-tabs (Аналитика / Сборка / ...), keeping the selected project and period. */
export function SectionTabs({
  tabs,
  pathname,
  query,
}: {
  tabs: { href: string; label: string }[];
  pathname: string;
  query: Query;
}) {
  if (tabs.length < 2) return null;
  return (
    <PillTabs
      label="Разделы"
      items={tabs.map((t) => ({ href: workspaceHref(t.href, query), label: t.label, active: t.href === pathname }))}
    />
  );
}

export function RangePicker({ path, query, current }: { path: string; query: Query; current: string }) {
  return (
    <PillTabs
      label="Период"
      className="w-fit"
      items={RANGES.map((r) => ({
        href: workspaceHref(path, query, { range: r.value === "30" ? undefined : r.value }),
        label: r.label,
        active: r.value === current,
      }))}
    />
  );
}

export function DemoNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-[18px] border border-dashed border-border bg-card/60 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
      <span>
        {children ??
          "Демо-режим: данные и действия пока не связаны с рекламными кабинетами и соцсетями. После подключения API здесь будут реальные цифры."}
      </span>
    </p>
  );
}

export function EmptyProjects() {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-8 text-sm text-muted-foreground">
      Нет доступных проектов. Проекты создаются во «Вводных».
    </div>
  );
}
