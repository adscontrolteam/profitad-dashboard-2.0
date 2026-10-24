import { clerkClient } from "@clerk/nextjs/server";
import { getAdminEmails } from "@/lib/access/admins";
import { normalizeEmail } from "@/lib/access/policy";
import { listGrants } from "@/lib/access/store";
import type { TeamMember } from "./stages";

/**
 * Everyone with access to the app, so tasks can be assigned before a person's first sign-in.
 * Names and avatars come from Clerk when the person has already signed up.
 */
export async function listTeam(): Promise<TeamMember[]> {
  const grants = await listGrants();
  const emails = [...new Set([...getAdminEmails(), ...grants.map((g) => normalizeEmail(g.email))])];
  if (emails.length === 0) return [];

  const profiles = new Map<string, { name: string | null; imageUrl: string | null }>();
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ emailAddress: emails, limit: 200 });
    for (const user of data) {
      const name = user.fullName || user.firstName || null;
      for (const address of user.emailAddresses) {
        profiles.set(normalizeEmail(address.emailAddress), { name, imageUrl: user.imageUrl ?? null });
      }
    }
  } catch {
    // Names are cosmetic; the list still works with emails only.
  }

  return emails
    .map((email) => ({ email, name: profiles.get(email)?.name ?? null, imageUrl: profiles.get(email)?.imageUrl ?? null }))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "ru"));
}
