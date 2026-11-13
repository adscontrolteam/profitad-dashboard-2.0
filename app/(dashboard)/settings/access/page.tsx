import type { Metadata } from "next";
import { AccessManager, type AccessRow } from "@/components/settings/access-manager";
import { RoleMatrix } from "@/components/settings/role-matrix";
import { getAdminEmails } from "@/lib/access/admins";
import { manageableRoles } from "@/lib/access/policy";
import { listGrants } from "@/lib/access/store";
import { requireAccessManager } from "@/lib/access/viewer";
import { getProjects } from "@/lib/data";

export const metadata: Metadata = { title: "Доступы" };

export default async function AccessPage() {
  const viewer = await requireAccessManager();
  const actorRole = viewer.permissions.role;
  const [grants, projects] = await Promise.all([listGrants(), getProjects()]);
  const admins = getAdminEmails();

  const rows: AccessRow[] = [
    ...admins.map((email) => ({ kind: "admin" as const, email, isSelf: email === viewer.email })),
    ...grants
      .filter((grant) => !admins.includes(grant.email))
      .map((grant) => ({
        kind: "grant" as const,
        grant,
        isSelf: grant.email === viewer.email,
        editable: grant.email !== viewer.email && manageableRoles(actorRole).length > 0,
      })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <AccessManager
        rows={rows}
        assignableRoles={manageableRoles(actorRole)}
        projects={projects.map(({ id, name }) => ({ id, name }))}
      />
      <RoleMatrix />
    </div>
  );
}
