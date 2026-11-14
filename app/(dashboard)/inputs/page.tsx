import type { Metadata } from "next";
import { ProjectsInputs } from "@/components/inputs/projects-inputs";
import { requireSection } from "@/lib/access/viewer";
import { getVisibleProjects } from "@/lib/data";
import { listOwnerCandidates } from "@/lib/projects/owners";
import { adsConfigured, listAccounts } from "@/lib/google/ads";
import { serviceAccountEmail } from "@/lib/google/auth";
import { listIntegrations, toView } from "@/lib/integrations/store";
import type { IntegrationView } from "@/lib/integrations/types";

export const metadata: Metadata = { title: "Вводные" };

export default async function InputsPage() {
  const { permissions } = await requireSection("inputs");
  const [projects, owners, integrations, adsAccounts] = await Promise.all([
    getVisibleProjects(permissions),
    listOwnerCandidates(),
    permissions.canEditInputs ? listIntegrations() : Promise.resolve([]),
    permissions.canEditInputs && adsConfigured() ? listAccounts().catch(() => null) : Promise.resolve(null),
  ]);
  const integrationsByProject: Record<string, IntegrationView[]> = {};
  for (const rec of integrations) (integrationsByProject[rec.projectId] ??= []).push(toView(rec));

  return (
    <div className="flex flex-col gap-3">
      {!permissions.canEditInputs && (
        <p className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
          Режим просмотра: редактирование «Вводных» недоступно для вашего уровня доступа.
        </p>
      )}
      <ProjectsInputs
        owners={owners}
        integrations={integrationsByProject}
        serviceAccountEmail={serviceAccountEmail()}
        adsAccounts={adsAccounts}
        projects={projects.map(({ metrics: _m, stats: _s, ...project }) => project)}
        canEdit={permissions.canEditInputs}
        canCreate={permissions.canEditInputs && permissions.projects === "all"}
        canDelete={permissions.canManageAccess}
      />
    </div>
  );
}
