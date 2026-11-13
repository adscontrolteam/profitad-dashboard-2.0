import { getAdminEmails } from "@/lib/access/admins";
import { listGrants } from "@/lib/access/store";
import { memberLabel } from "@/components/tasks/types";
import { listTeam } from "@/lib/tasks/team";

export interface OwnerOption {
  email: string;
  label: string;
}

export interface OwnerCandidates {
  smm: OwnerOption[];
  mediaBuyer: OwnerOption[];
}

/** Who can be responsible for a project: users with the matching role, plus admins. */
export async function listOwnerCandidates(): Promise<OwnerCandidates> {
  const [team, grants] = await Promise.all([listTeam(), listGrants()]);
  const admins = new Set(getAdminEmails());
  const roleOf = new Map(grants.map((g) => [g.email, g.role]));

  const pick = (role: "smm" | "media_buyer") =>
    team
      .filter((m) => roleOf.get(m.email) === role || admins.has(m.email))
      .map((m) => ({ email: m.email, label: memberLabel(m, m.email) + (admins.has(m.email) ? " · админ" : "") }));

  return { smm: pick("smm"), mediaBuyer: pick("media_buyer") };
}
