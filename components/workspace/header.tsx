import { allowedTabs, ADS_TABS, SMM_TABS } from "@/config/navigation";
import type { Permissions } from "@/lib/access/roles";
import type { Workspace } from "@/lib/workspace/context";
import { ProjectSelect } from "./project-select";
import { PeriodControl } from "./period-control";
import { SectionTabs } from "./toolbar";

/**
 * Top of every Ads/SMM page: project dropdown and (optionally) period.
 * Sub-tabs live in the app top bar on desktop and are repeated here only on mobile.
 */
export function WorkspaceHeader({
  section,
  pathname,
  workspace,
  permissions,
  withRange = false,
  extraQuery = {},
  children,
}: {
  section: "ads" | "smm";
  pathname: string;
  workspace: Workspace;
  permissions: Permissions;
  withRange?: boolean;
  extraQuery?: Record<string, string | undefined>;
  children?: React.ReactNode;
}) {
  const tabs = allowedTabs(section === "ads" ? ADS_TABS : SMM_TABS, permissions);
  const query = { ...workspace.query, ...extraQuery };

  return (
    <div className="flex flex-col gap-3">
      <div className="lg:hidden">
        <SectionTabs tabs={tabs} pathname={pathname} query={workspace.query} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProjectSelect projects={workspace.projects} current={workspace.project?.id} path={pathname} query={query} />
        {withRange && <PeriodControl path={pathname} query={query} period={workspace.range} />}
      </div>
      {children}
    </div>
  );
}
