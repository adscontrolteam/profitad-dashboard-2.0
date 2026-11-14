import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/access/viewer";
import { getVisibleProjects } from "@/lib/data";

/** «Проекты» in the menu opens the first project the viewer works on; the rest are one click away in the sidebar. */
export default async function ProjectsIndexPage() {
  const { permissions } = await requireSection("dashboard");
  const projects = (await getVisibleProjects(permissions)).filter((p) => p.status !== "archived");
  const first = projects.find((p) => p.status === "active") ?? projects[0];
  if (first) redirect(`/projects/${first.id}`);

  return (
    <Card>
      <p className="text-sm text-muted-foreground">Проектов пока нет. Они создаются во «Вводных».</p>
    </Card>
  );
}
