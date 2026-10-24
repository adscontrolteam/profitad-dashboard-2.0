import type { TeamMember } from "@/lib/tasks/stages";

export interface TaskProject {
  id: string;
  name: string;
  archived: boolean;
}

export const memberLabel = (member: TeamMember | undefined, email: string) => member?.name ?? email.split("@")[0];

export function initials(label: string) {
  const parts = label.replace(/[._-]+/g, " ").trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : label.slice(0, 2)).toUpperCase();
}
