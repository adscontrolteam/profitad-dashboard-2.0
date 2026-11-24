import { revalidatePath } from "next/cache";
import { runAutoInvoices } from "@/lib/finance/auto-invoices";
import { financeReminders } from "@/lib/finance/notify";

/**
 * Vercel Cron (vercel.json), every morning. From the 25th it issues the invoices for the next month; in the first
 * days of a month it recounts the share (% of income) of the invoices it issued. It also sends the owner's money
 * reminders to Telegram (lib/finance/notify.ts).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAutoInvoices();
  if (result.created.length || result.recounted.length) revalidatePath("/finance", "layout");
  // The owner hears about it in Telegram: invoices issued, the payroll to pay out on the 1st, who has not paid on the 3rd.
  const reminders = await financeReminders(result);
  return Response.json({ ...result, reminders });
}
