import { randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/log/notify";
import { addLog } from "@/lib/log/store";
import { threadsSignedUserId } from "@/lib/social/oauth";
import { deleteAccountEverywhere } from "@/lib/social/store";

/**
 * Threads → «Delete Callback URL»: the client asked to delete their data. All we hold is the account row with its access key,
 * so it is removed at once and Threads gets a confirmation code and a status address, as its protocol asks.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const userId = threadsSignedUserId(String(form?.get("signed_request") ?? ""));
  if (!userId) return new Response("Bad request", { status: 400 });
  const rows = await deleteAccountEverywhere("threads", userId);
  for (const row of rows) {
    await addLog(row.projectId, { area: "smm", kind: "info", status: "done", title: `Threads ${row.name}: данные удалены по запросу клиента` }).catch(() => undefined);
  }
  const code = randomToken(12);
  return Response.json({ url: `${appUrl()}/api/connect/threads/delete?code=${code}`, confirmation_code: code });
}

/** The status address from the answer above: deletion is immediate, so there is nothing to wait for. */
export function GET() {
  return new Response("Данные аккаунта Threads удалены из PROFITAD Dashboard. / Your Threads account data has been deleted.", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
