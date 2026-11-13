import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accessGrants, type AccessGrantRow } from "@/db/schema";
import { isAssignableRole, type AccessGrant, type AssignableRole } from "./roles";

// Grants are read uncached on purpose: a revoked access must stop working on the very next request.

function toGrant(row: AccessGrantRow): AccessGrant {
  return {
    email: row.email,
    role: isAssignableRole(row.role) ? row.role : null,
    storedRole: row.role,
    projectIds: row.projectIds ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function getGrant(email: string): Promise<AccessGrant | null> {
  const [row] = await getDb().select().from(accessGrants).where(eq(accessGrants.email, email)).limit(1);
  return row ? toGrant(row) : null;
}

export async function listGrants(): Promise<AccessGrant[]> {
  const rows = await getDb().select().from(accessGrants).orderBy(asc(accessGrants.email));
  return rows.map(toGrant);
}

export async function saveGrant(
  grant: { email: string; role: AssignableRole; projectIds: string[] | null },
  actorEmail: string,
) {
  const values = {
    email: grant.email,
    role: grant.role,
    sections: [],
    projectIds: grant.projectIds,
    canEditInputs: false,
    updatedAt: new Date(),
    updatedBy: actorEmail,
  };
  await getDb()
    .insert(accessGrants)
    .values(values)
    .onConflictDoUpdate({ target: accessGrants.email, set: values });
}

export async function deleteGrant(email: string) {
  await getDb().delete(accessGrants).where(eq(accessGrants.email, email));
}
