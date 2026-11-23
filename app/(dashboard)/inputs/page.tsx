import type { Metadata } from "next";
import { headers } from "next/headers";
import { ProjectsInputs } from "@/components/inputs/projects-inputs";
import { requireSection } from "@/lib/access/viewer";
import { getVisibleProjects } from "@/lib/data";
import { listOwnerCandidates } from "@/lib/projects/owners";
import { adsConfigured, listAccounts } from "@/lib/google/ads";
import { metaAdAccounts, metaConfigured } from "@/lib/meta/ads";
import { serviceAccountEmail } from "@/lib/google/auth";
import { listIntegrations, toView } from "@/lib/integrations/store";
import { listProjectAccess } from "@/lib/access-sync/sync";
import type { IntegrationView } from "@/lib/integrations/types";
import { businessPagesConfigured } from "@/lib/social/business";
import { providerConfigured } from "@/lib/social/oauth";
import { socialByProject } from "@/lib/social/store";
import type { AccessView } from "@/components/inputs/project-access";

export const metadata: Metadata = { title: "Вводные" };

export default async function InputsPage({ searchParams }: PageProps<"/inputs">) {
  const { permissions } = await requireSection("inputs");
  // «Подключить» on the Ads and SMM pages opens the project straight in the editor.
  const edit = (await searchParams).edit;
  const openId = typeof edit === "string" ? edit : null;
  const [projects, owners, integrations, adsAccounts] = await Promise.all([
    getVisibleProjects(permissions),
    listOwnerCandidates(),
    permissions.canEditInputs ? listIntegrations() : Promise.resolve([]),
    permissions.canEditInputs && adsConfigured() ? listAccounts().catch(() => null) : Promise.resolve(null),
  ]);
  const metaAccounts = permissions.canEditInputs && metaConfigured() ? await metaAdAccounts().catch(() => null) : null;
  const accessRows = permissions.canEditInputs ? await listProjectAccess(projects.map((p) => p.id)) : [];
  const accessByProject: Record<string, AccessView[]> = {};
  for (const r of accessRows)
    (accessByProject[r.projectId] ??= []).push({ service: r.service, email: r.email, status: r.status, error: r.error, role: r.role, target: r.target });
  const h = await headers();
  const social = permissions.canEditInputs
    ? {
        origin: `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`,
        ready: { meta: providerConfigured("meta"), threads: providerConfigured("threads"), business: businessPagesConfigured() },
        byProject: await socialByProject(projects.map((p) => p.id)),
      }
    : null;
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
        access={accessByProject}
        social={social}
        openId={permissions.canEditInputs ? openId : null}
        serviceAccountEmail={serviceAccountEmail()}
        adsAccounts={adsAccounts}
        metaAccounts={metaAccounts}
        projects={projects.map(({ metrics: _m, stats: _s, ...project }) => project)}
        canEdit={permissions.canEditInputs}
        canCreate={permissions.canEditInputs && permissions.projects === "all"}
        canDelete={permissions.canManageAccess}
      />
    </div>
  );
}
