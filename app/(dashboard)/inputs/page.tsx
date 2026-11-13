import type { Metadata } from "next";
import { ProjectsInputs } from "@/components/inputs/projects-inputs";
import { requireSection } from "@/lib/access/viewer";
import { getVisibleProjects } from "@/lib/data";
import { listOwnerCandidates } from "@/lib/projects/owners";

export const metadata: Metadata = { title: "Вводные" };

export default async function InputsPage() {
  const { permissions } = await requireSection("inputs");
  const [projects, owners] = await Promise.all([getVisibleProjects(permissions), listOwnerCandidates()]);

  return (
    <div className="flex flex-col gap-3">
      {!permissions.canEditInputs && (
        <p className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
          Режим просмотра: редактирование «Вводных» недоступно для вашего уровня доступа.
        </p>
      )}
      <ProjectsInputs
        owners={owners}
        projects={projects.map(({ id, name, status, goal, period, kpis, sources, notes, owners }) => ({
          id,
          name,
          status,
          goal,
          period,
          kpis,
          sources,
          notes,
          owners,
        }))}
        canEdit={permissions.canEditInputs}
        canCreate={permissions.canEditInputs && permissions.projects === "all"}
        canDelete={permissions.canManageAccess}
      />
    </div>
  );
}
