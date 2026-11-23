import { parseManychatBody, projectByManychatToken, recordManychatEvent } from "@/lib/manychat/store";

/**
 * ManyChat → «Make External Request» of an automation: one funnel step of one person.
 * POST /api/hooks/manychat/<token>   body: { "step": "start" | "contact" | "lead", "keyword": "…", "subscriber_id", "ig_username", "last_input" }
 * The token in the address is the project's secret (shown in «Вводные»). ManyChat waits at most 10 seconds for the answer.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const projectId = await projectByManychatToken(token);
  if (!projectId) return Response.json({ ok: false, error: "Неизвестный адрес. Скопируйте его заново из «Вводных»." }, { status: 404 });
  const event = parseManychatBody(await request.text().catch(() => ""));
  if (!event) return Response.json({ ok: false, error: 'В теле нужны "step" (start, contact или lead) и "keyword".' }, { status: 400 });
  const saved = await recordManychatEvent(projectId, event);
  return Response.json({ ok: true, saved, step: event.step, keyword: event.keyword });
}

/** Opening the address in a browser: says it is alive without telling anything about the project. */
export function GET() {
  return Response.json({ ok: true, hint: "Этот адрес принимает POST из ManyChat." });
}
