import Link from "next/link";
import { cn } from "@/lib/cn";

export function TaskViewTabs({ archived }: { archived: boolean }) {
  const tabs = [
    { href: "/tasks", label: "Доска", active: !archived },
    { href: "/tasks?view=archive", label: "Архив", active: archived },
  ];

  return (
    <nav aria-label="Вид задач" className="flex w-fit gap-1 rounded-full border border-border bg-card p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium tracking-[-0.01em] transition-colors",
            tab.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
