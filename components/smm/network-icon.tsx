import type { SocialNetwork } from "@/lib/workspace/params";

/** Simple monochrome marks — generic shapes, not the platforms' logos. */
export function NetworkIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (network) {
    case "instagram":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="3.8" />
          <path d="M17 7h.01" />
        </svg>
      );
    case "threads":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M15.5 10.5c-.5-1.8-1.8-2.7-3.5-2.7-2.2 0-3.6 1.7-3.6 4.2s1.4 4.2 3.6 4.2c1.6 0 2.8-.9 2.8-2.2 0-1.5-1.4-2.1-3-2" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M13.5 20.5V13h2.3l.4-2.6h-2.7V9c0-.8.3-1.3 1.4-1.3h1.4V5.4a14 14 0 0 0-2-.1c-2 0-3.3 1.2-3.3 3.4v1.7H8.7V13H11v7.5" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M14 3.5v11.2a3.3 3.3 0 1 1-3.3-3.3" />
          <path d="M14 3.5c.3 2.4 1.9 4 4.5 4.2" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="4" />
          <path d="m10.5 9.5 4 2.5-4 2.5Z" />
        </svg>
      );
  }
}
