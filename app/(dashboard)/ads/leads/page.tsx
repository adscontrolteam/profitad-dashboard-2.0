import type { Metadata } from "next";
import { ProjectLeads } from "@/components/projects/project-leads";
import { Card } from "@/components/ui/card";
import { WorkspaceHeader } from "@/components/workspace/header";
import { EmptyProjects } from "@/components/workspace/toolbar";
import { requireSection } from "@/lib/access/viewer";
import { resolveWorkspace } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Лиды" };

/** Leads of the project from the client's lead sheet / CRM. */
export default async function AdsLeadsPage({ searchParams }: PageProps<"/ads/leads">) {
  const params = await searchParams;
  const { permissions } = await requireSection("ads");
  const ws = await resolveWorkspace(params, permissions);
  const header = <WorkspaceHeader section="ads" pathname="/ads/leads" workspace={ws} permissions={permissions} />;
  if (!ws.project) return <div className="flex flex-col gap-5">{header}<EmptyProjects /></div>;

  return (
    <div className="flex flex-col gap-5">
      {header}
      {(await ProjectLeads({ projectId: ws.project.id, limit: 300 })) ?? (
        <Card>
          <p className="text-sm text-muted-foreground">Лидов пока нет: подключите таблицу лидов или CRM во «Вводных» → проект → «Подключения».</p>
        </Card>
      )}
    </div>
  );
}
