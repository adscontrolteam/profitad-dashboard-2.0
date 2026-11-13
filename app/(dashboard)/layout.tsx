import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ShellFallback } from "@/components/layout/shell-fallback";
import { NAV_ITEMS } from "@/config/navigation";
import { canViewSection, visibleProjects } from "@/lib/access/policy";
import { ROLE_META } from "@/lib/access/roles";
import { requireViewer } from "@/lib/access/viewer";
import { getProjectNav } from "@/lib/data";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <ViewerShell>{children}</ViewerShell>
    </Suspense>
  );
}

async function ViewerShell({ children }: { children: React.ReactNode }) {
  const [viewer, projects] = await Promise.all([requireViewer(), getProjectNav()]);
  const { permissions } = viewer;

  const routes = NAV_ITEMS.filter((item) => !item.section || canViewSection(permissions, item.section)).map(
    (item) => item.href,
  );

  return (
    <AppShell
      routes={routes}
      projects={visibleProjects(permissions, projects)}
      roleLabel={ROLE_META[permissions.role].label}
      capabilities={{
        canManageAds: permissions.canManageAds,
        canPublishContent: permissions.canPublishContent,
      }}
    >
      {children}
    </AppShell>
  );
}
