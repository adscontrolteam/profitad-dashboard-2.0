import type { Metadata } from "next";
import { CampaignBuilder } from "@/components/ads/campaign-builder";
import { WorkspaceHeader } from "@/components/workspace/header";
import { DemoNotice, EmptyProjects } from "@/components/workspace/toolbar";
import { requireCapability } from "@/lib/access/viewer";
import { resolveWorkspace } from "@/lib/workspace/context";
import { adsConfigured } from "@/lib/google/ads";

export const metadata: Metadata = { title: "Сборка кампаний" };

export default async function Page({ searchParams }: PageProps<"/ads/campaigns">) {
  const params = await searchParams;
  const { permissions } = await requireCapability("ads", "canManageAds");
  const ws = await resolveWorkspace(params, permissions);

  return (
    <div className="flex flex-col gap-5">
      <WorkspaceHeader section="ads" pathname="/ads/campaigns" workspace={ws} permissions={permissions} />
      <DemoNotice>
        Запуск в Google Ads работает по-настоящему для поисковых кампаний, если к проекту привязан кабинет и настроен API. Meta —
        после разблокировки приложения; до этого кампании сохраняются как задания.
      </DemoNotice>
      {ws.project ? (
        <CampaignBuilder
          key={ws.project.id}
          projectId={ws.project.id}
          projectName={ws.project.name}
          googleAccountId={ws.project.sources.find((s) => s.platform === "google" && s.accountId)?.accountId.replace(/\D/g, "") || null}
          googleReady={adsConfigured()}
        />
      ) : (
        <EmptyProjects />
      )}
    </div>
  );
}
