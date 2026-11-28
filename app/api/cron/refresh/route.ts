import { refreshAllStale } from "@/lib/data/refresh";

/**
 * Hourly background refresh of all active projects (see lib/data/refresh.ts). Vercel's own cron runs once a day on our
 * plan, so this address is called every hour from GitHub Actions (.github/workflows/hourly-refresh.yml).
 * It needs no key: all it can do is start the refresh, and that happens at most once per period whoever calls.
 */
export async function GET() {
  const result = await refreshAllStale();
  return Response.json(result);
}
