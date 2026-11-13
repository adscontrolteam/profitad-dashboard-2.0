import type { Metadata } from "next";
import { PostingQueue } from "@/components/smm/posting-queue";
import { WorkspaceHeader } from "@/components/workspace/header";
import { DemoNotice, EmptyProjects } from "@/components/workspace/toolbar";
import { requireCapability } from "@/lib/access/viewer";
import { resolveWorkspace } from "@/lib/workspace/context";
import { workspaceHref } from "@/lib/workspace/params";

export const metadata: Metadata = { title: "Постинг" };

export default async function Page({ searchParams }: PageProps<"/smm/posting">) {
  const params = await searchParams;
  const { permissions } = await requireCapability("smm", "canPublishContent");
  const ws = await resolveWorkspace(params, permissions);

  return (
    <div className="flex flex-col gap-5">
      <WorkspaceHeader section="smm" pathname="/smm/posting" workspace={ws} permissions={permissions} />
      <DemoNotice />
      {ws.project ? (
        <PostingQueue
          key={ws.project.id}
          projectId={ws.project.id}
          projectName={ws.project.name}
          contentHref={workspaceHref("/smm/content", ws.query)}
        />
      ) : (
        <EmptyProjects />
      )}
    </div>
  );
}
