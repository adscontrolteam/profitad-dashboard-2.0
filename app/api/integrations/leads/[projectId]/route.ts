import { safeEqual } from "@/lib/crypto";
import { normalizeWebhook } from "@/lib/integrations/crm";
import { getIntegration, markIntegration, readSecret, upsertLeads } from "@/lib/integrations/store";
import type { CrmConfig } from "@/lib/integrations/types";

/**
 * Inbound leads for one project, from any CRM, form builder or Zapier/Make.
 * POST /api/integrations/leads/<projectId>   key: header `x-api-key` or `?key=`
 * Body: JSON object, array, or form fields — see normalizeWebhook for accepted keys.
 */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const rec = await getIntegration(projectId, "crm");
  const expected = rec && (rec.config as CrmConfig).type === "webhook" ? readSecret(rec) : null;
  const given = request.headers.get("x-api-key") ?? new URL(request.url).searchParams.get("key") ?? "";
  if (!expected || !given || !safeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = request.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body = type.includes("json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return Response.json({ error: "Не удалось прочитать тело запроса" }, { status: 400 });
  }

  const leads = normalizeWebhook(body);
  if (leads.length === 0) return Response.json({ error: "Лидов в запросе нет" }, { status: 400 });
  const saved = await upsertLeads(projectId, "webhook", leads);
  await markIntegration(projectId, "crm", null);
  return Response.json({ ok: true, saved });
}
