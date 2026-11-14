import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { recentLeads } from "@/lib/integrations/store";

const OUTCOME: Record<string, { label: string; className: string }> = {
  new: { label: "новый", className: "bg-muted text-muted-foreground" },
  qualified: { label: "в работе", className: "bg-info/12 text-info" },
  no_answer: { label: "не ответил", className: "bg-warning/14 text-warning" },
  won: { label: "продажа", className: "bg-positive/12 text-positive" },
  lost: { label: "отказ", className: "bg-negative/12 text-negative" },
  junk: { label: "спам / нецелевой", className: "bg-warning/14 text-warning" },
};

const SOURCE: Record<string, string> = { webhook: "вебхук", kommo: "Kommo", bitrix24: "Bitrix24", sheet: "таблица" };

/** Latest leads from the project's CRM / lead sheet. Renders nothing when no lead source is connected. */
export async function ProjectLeads({ projectId }: { projectId: string }) {
  const leads = await recentLeads(projectId, 30);
  if (leads.length === 0) return null;

  const counts = leads.reduce<Record<string, number>>((acc, l) => ((acc[l.outcome] = (acc[l.outcome] ?? 0) + 1), acc), {});

  return (
    <Card className="min-w-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Лиды</h2>
        <p className="flex flex-wrap gap-1.5 text-xs">
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} className={cn("rounded-full px-2 py-0.5 font-semibold", OUTCOME[k]?.className)}>
              {OUTCOME[k]?.label ?? k}: {n}
            </span>
          ))}
        </p>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Когда</th>
              <th className="py-2 pr-3 font-medium">Имя</th>
              <th className="py-2 pr-3 font-medium">Контакт</th>
              <th className="py-2 pr-3 font-medium">Кампания</th>
              <th className="py-2 pr-3 font-medium">Статус</th>
              <th className="py-2 font-medium">Источник</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-3 text-xs tabular-nums text-muted-foreground">
                  {l.leadAt.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" })}
                </td>
                <td className="py-2 pr-3 font-medium">{l.name || "—"}</td>
                <td className="py-2 pr-3 text-xs">{[l.phone, l.email].filter(Boolean).join(" · ") || "—"}</td>
                <td className="max-w-[180px] truncate py-2 pr-3 text-xs text-muted-foreground">{l.campaign || "—"}</td>
                <td className="py-2 pr-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", OUTCOME[l.outcome]?.className)} title={l.status}>
                    {l.status || OUTCOME[l.outcome]?.label}
                  </span>
                </td>
                <td className="py-2 text-xs text-muted-foreground">{SOURCE[l.source] ?? l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
