"use client";

import { useRouter } from "next/navigation";

/** A table row that opens a page on click; buttons and links inside keep working on their own. */
export function ClickRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      tabIndex={0}
      role="link"
      className="cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input, select, [role=dialog]")) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
