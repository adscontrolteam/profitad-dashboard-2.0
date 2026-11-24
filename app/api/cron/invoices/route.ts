import { revalidatePath } from "next/cache";
import { runAutoInvoices } from "@/lib/finance/auto-invoices";

/**
 * Vercel Cron (vercel.json), every morning. From the 25th it issues the invoices for the next month; in the first
 * days of a month it recounts the share (% of income) of the invoices it issued. On other days it does nothing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAutoInvoices();
  if (result.created.length || result.recounted.length) revalidatePath("/finance", "layout");
  return Response.json(result);
}
