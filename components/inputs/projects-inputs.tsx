"use client";

import { useState } from "react";
import { SourceChips } from "@/components/projects/source-chips";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { METRICS } from "@/lib/domain/metrics";
import type { Project } from "@/lib/domain/types";
import { formatDate, formatMetric } from "@/lib/format";
import type { OwnerCandidates } from "@/lib/projects/owners";
import { INTEGRATION_LABELS } from "@/lib/integrations/kinds";
import type { IntegrationView } from "@/lib/integrations/types";
import { cn } from "@/lib/cn";
import type { AdsAccountOption } from "./project-editor";
import { ProjectEditor, type EditableProject } from "./project-editor";

export function ProjectsInputs({
  projects,
  owners,
  integrations,
  serviceAccountEmail,
  adsAccounts,
  canEdit,
  canCreate,
  canDelete,
}: {
  projects: EditableProject[];
  owners: OwnerCandidates;
  integrations: Record<string, IntegrationView[]>;
  serviceAccountEmail: string | null;
  /** Google Ads accounts under the MCC; null when the API is not configured. */
  adsAccounts: AdsAccountOption[] | null;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<EditableProject | "new" | null>(null);
  const labelOf = new Map([...owners.smm, ...owners.mediaBuyer].map((o) => [o.email, o.label.replace(" · админ", "")]));
  const ownerName = (email: string | null) => (email ? (labelOf.get(email) ?? email.split("@")[0]) : "—");

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Проекты</h2>
          <p className="mt-1 text-sm text-muted-foreground">Цели, KPI и источники трафика по каждому проекту.</p>
        </div>
        {canCreate && (
          <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
            Новый проект
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1040px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 pb-2 font-medium">Проект</th>
              <th className="px-4 pb-2 font-medium">Основная цель</th>
              <th className="px-4 pb-2 font-medium">План на этот месяц</th>
              <th className="px-4 pb-2 font-medium">Источники трафика</th>
              <th className="px-4 pb-2 font-medium">Ответственные</th>
              <th className="px-4 pb-2 font-medium">В работе</th>
              {canEdit && <th className="w-px px-4 pb-2" />}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="group align-top">
                <td className="rounded-l-[18px] bg-background/70 px-4 py-3 transition-colors group-hover:bg-muted">
                  <p className="font-semibold tracking-[-0.02em]">{project.name}</p>
                  <div className="mt-1.5">
                    <StatusBadge status={project.status} />
                  </div>
                  <IntegrationDots items={integrations[project.id] ?? []} />
                </td>
                <td className="bg-background/70 px-4 py-3 text-muted-foreground transition-colors group-hover:bg-muted">
                  {project.goal || "—"}
                </td>
                <td className="bg-background/70 px-4 py-3 transition-colors group-hover:bg-muted">
                  <KpiList kpis={project.kpis} currency={project.agent.currency} />
                  {project.planCarried && project.kpis.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-warning">План с прошлого месяца — задайте на этот</p>
                  )}
                </td>
                <td className="bg-background/70 px-4 py-3 transition-colors group-hover:bg-muted">
                  {project.sources.length ? <SourceChips sources={project.sources} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="bg-background/70 px-4 py-3 text-xs transition-colors group-hover:bg-muted">
                  <p>
                    <span className="text-muted-foreground">SMM:</span> {ownerName(project.owners.smm)}
                  </p>
                  <p className="mt-1">
                    <span className="text-muted-foreground">MediaBuyer:</span> {ownerName(project.owners.mediaBuyer)}
                  </p>
                </td>
                <td className="whitespace-nowrap bg-background/70 px-4 py-3 text-muted-foreground tabular-nums transition-colors group-hover:bg-muted">
                  с {formatDate(project.startDate)}
                </td>
                {canEdit && (
                  <td className="rounded-r-[18px] bg-background/70 px-2 py-2 transition-colors group-hover:bg-muted">
                    <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setEditing(project)}>
                      Изменить
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Проектов пока нет.</p>}
      </div>

      {editing && (
        <ProjectEditor
          key={editing === "new" ? "new" : editing.id}
          project={editing === "new" ? null : editing}
          owners={owners}
          integrations={editing === "new" ? [] : (integrations[editing.id] ?? [])}
          serviceAccountEmail={serviceAccountEmail}
          adsAccounts={adsAccounts}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function KpiList({ kpis, currency }: { kpis: Project["kpis"]; currency: string | null }) {
  if (kpis.length === 0) return <span className="text-muted-foreground">Не заданы</span>;
  return (
    <ul className="flex flex-col gap-1.5">
      {kpis.map((kpi, i) => (
        <li key={kpi.metric} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">
            {METRICS[kpi.metric].label}
            {i === 0 && kpis.length > 1 && <span className="ml-1 text-xs font-medium text-muted-foreground">· главный</span>}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            план {formatMetric(kpi.plan, METRICS[kpi.metric].format)} · цена {formatMetric(kpi.cpaPlan, "currency", currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const SHORT: Record<IntegrationView["kind"], string> = { crm: "CRM", sheets_leads: "Лиды", sheets_report: "Репорт", drive: "Drive" };

function IntegrationDots({ items }: { items: IntegrationView[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {items.map((i) => (
        <span
          key={i.kind}
          title={`${INTEGRATION_LABELS[i.kind]}${i.lastError ? ` — ${i.lastError}` : ""}`}
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            i.status === "ok" ? "bg-positive/12 text-positive" : i.status === "error" ? "bg-negative/12 text-negative" : "bg-muted text-muted-foreground",
          )}
        >
          {SHORT[i.kind]}
        </span>
      ))}
    </div>
  );
}
