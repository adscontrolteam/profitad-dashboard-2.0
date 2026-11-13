import type { Metadata } from "next";
import { CreativesStudio } from "@/components/ads/creatives-studio";
import { DriveSection } from "@/components/drive/drive-section";
import { WorkspaceHeader } from "@/components/workspace/header";
import { DemoNotice, EmptyProjects } from "@/components/workspace/toolbar";
import { requireCapability } from "@/lib/access/viewer";
import { resolveWorkspace } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Креативы" };

export default async function Page({ searchParams }: PageProps<"/ads/creatives">) {
  const params = await searchParams;
  const { permissions } = await requireCapability("ads", "canManageAds");
  const ws = await resolveWorkspace(params, permissions);

  return (
    <div className="flex flex-col gap-5">
      <WorkspaceHeader section="ads" pathname="/ads/creatives" workspace={ws} permissions={permissions} />
      <DemoNotice />
      {ws.project ? (
        <>
          <CreativesStudio key={ws.project.id} projectId={ws.project.id} projectName={ws.project.name} />
          <DriveSection projectId={ws.project.id} canUpload />
        </>
      ) : (
        <EmptyProjects />
      )}
    </div>
  );
}
