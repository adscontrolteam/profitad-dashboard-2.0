import { leadSource } from "@/lib/integrations/lead-source";
import { recentLeads } from "@/lib/integrations/store";
import { LeadsTable } from "./leads-table";

/** Latest leads from the project's CRM / lead sheet. Renders nothing when no lead source is connected. */
export async function ProjectLeads({ projectId, limit = 30 }: { projectId: string; limit?: number }) {
  const leads = await recentLeads(projectId, limit);
  if (leads.length === 0) return null;

  return (
    <LeadsTable
      leads={leads.map((l) => ({
        id: l.id,
        when: l.leadAt.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }),
        name: l.name,
        contact: [l.phone, l.email].filter(Boolean).join(" · "),
        campaign: l.campaign,
        status: l.status,
        outcome: l.outcome,
        source: leadSource(l.utm),
      }))}
    />
  );
}
