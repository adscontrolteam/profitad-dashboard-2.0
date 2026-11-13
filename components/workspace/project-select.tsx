"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { workspaceHref } from "@/lib/workspace/params";

export function ProjectSelect({
  projects,
  current,
  path,
  query,
}: {
  projects: { id: string; name: string }[];
  current: string | undefined;
  path: string;
  query: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (projects.length === 0) return null;

  return (
    <label className="relative flex w-full items-center sm:w-auto">
      <span className="sr-only">Проект</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const href = workspaceHref(path, query, { p: e.target.value });
          startTransition(() => router.push(href, { scroll: false }));
        }}
        className={cn(
          "w-full appearance-none rounded-full border border-border bg-card py-2 pr-10 pl-4 text-sm font-semibold tracking-[-0.01em] shadow-[var(--shadow)] outline-none transition-opacity focus-visible:border-ring sm:min-w-56",
          pending && "opacity-60",
        )}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="pointer-events-none absolute right-4 size-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}
