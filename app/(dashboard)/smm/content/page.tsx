import type { Metadata } from "next";
import { ContentStudio } from "@/components/smm/content-studio";
import { WorkspaceHeader } from "@/components/workspace/header";
import { DemoNotice, EmptyProjects } from "@/components/workspace/toolbar";
import { requireCapability } from "@/lib/access/viewer";
import { resolveWorkspace } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Создание контента" };

export default async function Page({ searchParams }: PageProps<"/smm/content">) {
  const params = await searchParams;
  const { permissions } = await requireCapability("smm", "canPublishContent");
  const ws = await resolveWorkspace(params, permissions);

  return (
    <div className="flex flex-col gap-5">
      <WorkspaceHeader section="smm" pathname="/smm/content" workspace={ws} permissions={permissions} />
      <DemoNotice />
      {ws.project ? (
        <ContentStudio key={ws.project.id} projectId={ws.project.id} projectName={ws.project.name} />
      ) : (
        <EmptyProjects />
      )}
    </div>
  );
}
