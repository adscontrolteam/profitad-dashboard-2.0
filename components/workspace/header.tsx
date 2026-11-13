import { allowedTabs, ADS_TABS, SMM_TABS } from "@/config/navigation";
import type { Permissions } from "@/lib/access/roles";
import type { Workspace } from "@/lib/workspace/context";
import { ProjectPicker, RangePicker, SectionTabs } from "./toolbar";

/** Top of every Ads/SMM page: sub-tabs, project and (optionally) period. */
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTabs tabs={tabs} pathname={pathname} query={workspace.query} />
        {withRange && <RangePicker path={pathname} query={query} current={workspace.range.value} />}
      </div>
      <ProjectPicker projects={workspace.projects} current={workspace.project?.id} path={pathname} query={query} />
      {children}
    </div>
  );
}
