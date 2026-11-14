import type { Metadata } from "next";
import { CreativesStudio } from "@/components/ads/creatives-studio";
import { DriveSection } from "@/components/drive/drive-section";
import { WorkspaceHeader } from "@/components/workspace/header";
import { DemoNotice, EmptyProjects, PillTabs } from "@/components/workspace/toolbar";
import { first, workspaceHref } from "@/lib/workspace/params";
import { requireCapability } from "@/lib/access/viewer";
import { resolveWorkspace } from "@/lib/workspace/context";

export const metadata: Metadata = { title: "Креативы" };

export default async function Page({ searchParams }: PageProps<"/ads/creatives">) {
  const params = await searchParams;
  const { permissions } = await requireCapability("ads", "canManageAds");
  const ws = await resolveWorkspace(params, permissions);
  // Google or Meta: asked in the URL, otherwise the project's own ad platform (Google first when it has both accounts).
  const sources = ws.project?.sources ?? [];
  const wanted = first(params.platform);
  const platform =
    wanted === "google" || wanted === "meta"
      ? wanted
      : (sources.find((s) => s.platform === "google" && s.accountId) ?? sources.find((s) => s.platform === "google" || s.platform === "meta"))?.platform === "google"
        ? "google"
        : "meta";

  return (
    <div className="flex flex-col gap-5">
      <WorkspaceHeader section="ads" pathname="/ads/creatives" workspace={ws} permissions={permissions} />
      {ws.project && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PillTabs
            label="Платформа"
            className="w-fit"
            items={[
              { id: "google", label: "Google Ads" },
              { id: "meta", label: "Meta Ads" },
            ].map((p) => ({
              href: workspaceHref("/ads/creatives", { ...ws.query }, { platform: p.id }),
              label: p.label,
              active: p.id === platform,
            }))}
          />
          <span className="text-xs text-muted-foreground">
            {platform === "google" ? "Поисковые объявления (тексты) и креативы для PMax, Demand Gen, YouTube" : "Креативы для ленты, Stories и Reels"}
          </span>
        </div>
      )}
      <DemoNotice />
      {ws.project ? (
        <>
          <CreativesStudio key={`${ws.project.id}:${platform}`} projectId={ws.project.id} projectName={ws.project.name} platform={platform} />
          <DriveSection projectId={ws.project.id} canUpload />
        </>
      ) : (
        <EmptyProjects />
      )}
    </div>
  );
}
