import "server-only";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

/** Records an action that changed something outside the dashboard. Never throws: logging must not break the action. */
export async function audit(entry: {
  actorEmail: string;
  action: string;
  projectId?: string | null;
  target?: string;
  payload?: unknown;
  ok: boolean;
  result?: string;
}) {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        id: crypto.randomUUID(),
        actorEmail: entry.actorEmail,
        action: entry.action,
        projectId: entry.projectId ?? null,
        target: entry.target ?? "",
        payload: entry.payload ?? null,
        ok: entry.ok,
        result: (entry.result ?? "").slice(0, 2000),
      });
  } catch (error) {
    console.error("audit log write failed", error);
  }
}
