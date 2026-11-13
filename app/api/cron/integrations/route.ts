import { syncAll } from "@/lib/integrations/run";

/** Vercel Cron (vercel.json): pulls CRM leads and lead sheets, fills the daily reports. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await syncAll();
  return Response.json({ ran: results.length, failed: results.filter((r) => !r.ok).length, results });
}
