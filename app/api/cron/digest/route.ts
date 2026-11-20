import { notifyLogs } from "@/lib/log/notify";

/** The digest goes out in this hour of the Warsaw day, whatever the season. */
const SEND_HOUR = 9;
const warsawHour = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(now));

/**
 * Vercel Cron (vercel.json): the «Посмотреть Лог» reminder in the project chats, at 09:00 Warsaw time.
 * Vercel schedules are in UTC and know nothing about daylight saving, so two runs are scheduled (07:00 and 08:00 UTC)
 * and only the one that falls into the 9th hour in Warsaw sends: 08:00 UTC in winter, 07:00 UTC in summer.
 * Kept apart from the data sync (/api/cron/integrations, 05:00 UTC): the agent reads fresh data early in the morning.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const hour = warsawHour(now);
  if (hour !== SEND_HOUR) return Response.json({ sent: 0, skipped: `в Варшаве ${hour}:00, дайджест уходит в ${SEND_HOUR}:00` });
  const results = await notifyLogs(now);
  return Response.json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
}
