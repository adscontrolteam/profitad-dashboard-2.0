import { connection } from "next/server";
import { refreshAllStale } from "@/lib/data/refresh";

/** The whole round over the projects has to fit in one call. */
export const maxDuration = 300;

/**
 * Hourly background refresh of all active projects (see lib/data/refresh.ts). Vercel's own cron runs once a day on our
 * plan, so this address is called every hour from GitHub Actions (.github/workflows/hourly-refresh.yml) and by the
 * dashboard when it is opened. It needs no key: all it can do is start the refresh, and that happens at most once
 * per period whoever calls.
 */
export async function GET() {
  // Never at build time and never from a cache: every call is a real request.
  await connection();
  return Response.json(await refreshAllStale());
}
