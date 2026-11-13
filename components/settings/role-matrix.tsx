import { Card } from "@/components/ui/card";
import { permissionsFor } from "@/lib/access/policy";
import { ROLE_META, ROLES, type Permissions } from "@/lib/access/roles";
import { cn } from "@/lib/cn";

type Level = "full" | "view" | "none";

const ROWS: { label: string; level: (p: Permissions) => Level }[] = [
  { label: "Дашборд и проекты", level: (p) => (p.sections.includes("dashboard") ? "view" : "none") },
  { label: "Аналитика рекламы", level: (p) => (p.sections.includes("ads") ? "view" : "none") },
  { label: "Сборка кампаний и креативы", level: (p) => (p.canManageAds ? "full" : "none") },
  { label: "Аналитика SMM", level: (p) => (p.sections.includes("smm") ? "view" : "none") },
  { label: "Создание контента и постинг", level: (p) => (p.canPublishContent ? "full" : "none") },
  { label: "Sales", level: (p) => (p.sections.includes("sales") ? "full" : "none") },
  { label: "Task Manager", level: (p) => (p.sections.includes("tasks") ? "full" : "none") },
  { label: "Вводные", level: (p) => (p.canEditInputs ? "full" : "none") },
  { label: "Доступы", level: (p) => (p.canManageAccess ? "full" : "none") },
];

const MARK: Record<Level, { text: string; className: string }> = {
  full: { text: "✓", className: "bg-positive/12 text-positive" },
  view: { text: "смотрит", className: "bg-muted text-foreground" },
  none: { text: "—", className: "text-muted-foreground" },
};

export function RoleMatrix() {
  const perms = ROLES.map((role) => permissionsFor(role));
  return (
    <Card className="min-w-0">
      <h2 className="section-title">Что может каждая роль</h2>
      <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium" />
              {ROLES.map((r) => (
                <th key={r} className="py-2 pr-3 text-center font-semibold text-foreground">
                  {ROLE_META[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <td className="py-2.5 pr-3">{row.label}</td>
                {perms.map((p) => {
                  const level = row.level(p);
                  const m = MARK[p.role === "admin" && level === "view" ? "full" : level];
                  return (
                    <td key={p.role} className="py-2.5 pr-3 text-center">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", m.className)}>{m.text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
