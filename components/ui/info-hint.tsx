"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Small (i) next to a heading: the explanation stays out of the way until asked for.
 * Opens on hover, focus and tap; closes on Escape or a click elsewhere.
 */
export function InfoHint({
  children,
  label = "Пояснение",
  caption,
  className,
}: {
  children: React.ReactNode;
  label?: string;
  /** Short visible text next to the icon, for hints that have no heading to sit beside. */
  caption?: string;
  className?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const open = pinned || hover;
  const panel = useRef<HTMLSpanElement>(null);

  // Keep the panel inside the screen: start under the icon, slide left when it would run past the edge.
  useLayoutEffect(() => {
    const box = panel.current;
    const anchor = ref.current;
    if (!open || !box || !anchor) return;
    const gutter = 16;
    const width = Math.min(420, window.innerWidth - gutter * 2);
    const at = anchor.getBoundingClientRect().left;
    const left = Math.max(gutter, Math.min(at, window.innerWidth - gutter - width));
    box.style.width = `${width}px`;
    box.style.left = `${left - at}px`;
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex w-fit align-middle", className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label={caption ? undefined : label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          setPinned((v) => !v);
        }}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className="group inline-flex items-center gap-1.5 rounded-full text-xs font-normal normal-case tracking-normal text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-border font-sans text-[11px] font-semibold italic leading-none transition-colors",
            "group-hover:border-foreground/40 group-hover:text-foreground",
            open && "border-foreground/40 text-foreground",
          )}
        >
          i
        </span>
        {caption && <span className="font-sans underline decoration-dotted underline-offset-4 group-hover:text-foreground">{caption}</span>}
      </button>
      {open && (
        <span
          id={id}
          ref={panel}
          role="tooltip"
          className="absolute left-0 top-full z-30 w-[420px] pt-2"
        >
          <span className="block font-sans rounded-[16px] border border-border bg-card px-4 py-3 text-left text-xs font-normal normal-case not-italic leading-5 tracking-normal text-muted-foreground shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
            {children}
          </span>
        </span>
      )}
    </span>
  );
}
