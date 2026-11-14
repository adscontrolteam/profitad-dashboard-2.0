import { cn } from "@/lib/cn";
import { allowedTabs, ADS_TABS, SMM_TABS } from "@/config/navigation";
import type { Permissions } from "@/lib/access/roles";
import type { Workspace } from "@/lib/workspace/context";
import { ProjectMobileNav } from "@/components/projects/project-mobile-nav";
import { PeriodControl } from "./period-control";
import { SectionTabs } from "./toolbar";

/**
 * Top of every Ads/SMM page: the period, when the page has one.
 * The project and the sub-tabs are chosen in the sidebar and the top bar on desktop; phones get them here.
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
    <div className={cn("flex flex-col gap-3", !withRange && !children && "lg:hidden")}>
      <ProjectMobileNav
        projects={workspace.projects}
        projectId={workspace.project?.id}
        area={section}
        pathname={pathname}
        query={query}
        permissions={permissions}
      />
      <div className="lg:hidden">
        <SectionTabs tabs={tabs} pathname={pathname} query={workspace.query} />
      </div>
      {withRange && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <PeriodControl path={pathname} query={query} period={workspace.range} />
        </div>
      )}
      {children}
    </div>
  );
}
