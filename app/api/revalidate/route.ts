import { revalidateTag } from "next/cache";
import { TAGS } from "@/lib/data/tags";

/**
 * Webhook for integrations/automations: call after new data lands.
 * POST /api/revalidate  { "projectId"?: string }
 * Header: Authorization: Bearer <REVALIDATE_SECRET>
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { projectId?: unknown };
  // Project rows feed both the project page and every list (dashboard, project pages, nav).
  revalidateTag(TAGS.projects, "max");
  const tag = typeof body.projectId === "string" ? TAGS.project(body.projectId) : TAGS.projects;
  if (tag !== TAGS.projects) revalidateTag(tag, "max");

  return Response.json({ revalidated: tag });
}
