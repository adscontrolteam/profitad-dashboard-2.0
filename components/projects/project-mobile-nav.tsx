import { PillTabs } from "@/components/workspace/toolbar";
import { PROJECT_AREAS } from "@/config/navigation";
import { canViewSection } from "@/lib/access/policy";
import type { Permissions } from "@/lib/access/roles";
import { workspaceHref } from "@/lib/workspace/params";

type Query = Record<string, string | undefined>;

/**
 * Phones have no sidebar tree, so the same two choices sit at the top of every project page:
 * which project, and which part of it (Обзор / Реклама / SMM).
 */
export function ProjectMobileNav({
  projects,
  projectId,
  area,
  pathname,
  query = {},
  permissions,
}: {
  projects: { id: string; name: string }[];
  projectId: string | undefined;
  /** null = the project's main page. */
  area: "ads" | "smm" | null;
  /** Page to stay on when the project changes (Реклама / SMM tabs); the main page ignores it. */
  pathname?: string;
  query?: Query;
  permissions: Permissions;
}) {
  if (!projectId) return null;
  const areas = PROJECT_AREAS.filter((a) => canViewSection(permissions, a.section));
  const hrefFor = (id: string) => (area && pathname ? workspaceHref(pathname, query, { p: id }) : `/projects/${id}`);

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      {projects.length > 1 && (
        <PillTabs
          label="Проект"
          items={projects.map((p) => ({ href: hrefFor(p.id), label: p.name, active: p.id === projectId }))}
        />
      )}
      {areas.length > 0 && (
        <PillTabs
          label="Раздел проекта"
          className="w-fit"
          items={[
            { href: `/projects/${projectId}`, label: "Обзор", active: area === null },
            ...areas.map((a) => ({ href: `${a.href}?p=${projectId}`, label: a.label, active: a.key === area })),
          ]}
        />
      )}
    </div>
  );
}
