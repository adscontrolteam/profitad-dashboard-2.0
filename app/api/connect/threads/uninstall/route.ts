import { addLog } from "@/lib/log/store";
import { threadsSignedUserId } from "@/lib/social/oauth";
import { markAccountRevoked } from "@/lib/social/store";

/** Threads → «Uninstall Callback URL»: the client removed our app in their Threads settings. The account is marked «connect again». */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const userId = threadsSignedUserId(String(form?.get("signed_request") ?? ""));
  if (!userId) return new Response("Bad request", { status: 400 });
  const rows = await markAccountRevoked("threads", userId, "Клиент отключил доступ в Threads. Попросите подключить заново по ссылке.");
  for (const row of rows) {
    await addLog(row.projectId, { area: "smm", kind: "info", status: "needs_you", title: `Threads ${row.name}: клиент отключил доступ` }).catch(() => undefined);
  }
  return Response.json({ ok: true });
}
