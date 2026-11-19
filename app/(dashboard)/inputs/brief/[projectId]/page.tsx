import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBrief } from "@/components/brief/admin-brief";
import { KickoffMessage } from "@/components/brief/kickoff-message";
import { telegramConfigured } from "@/lib/log/notify";
import { listLog } from "@/lib/log/store";
import { canViewProject } from "@/lib/access/policy";
import { requireSection } from "@/lib/access/viewer";
import { BRIEF_LANGS, type BriefLang } from "@/lib/brief/questions";
import { ensureBrief } from "@/lib/brief/store";
import { getProject } from "@/lib/data";

export const metadata: Metadata = { title: "Бриф клиента" };

/** Our side of a project's client brief: link, language, questions, our answers and notes. */
export default async function BriefAdminPage({ params }: PageProps<"/inputs/brief/[projectId]">) {
  const { projectId } = await params;
  const viewer = await requireSection("inputs");
  if (!viewer.permissions.canEditInputs || !canViewProject(viewer.permissions, projectId)) notFound();
  const project = await getProject(projectId);
  if (!project) notFound();
  const brief = await ensureBrief(projectId);
  const kickoff = (await listLog(projectId, "project", 300)).find((l) => l.topic === "kickoff");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <Link href="/inputs" className="btn-ghost border border-border px-3 py-1.5 text-sm">
          ← Вводные
        </Link>
        <h1 className="text-lg font-semibold tracking-[-0.02em]">Бриф клиента · {project.name}</h1>
      </div>
      <KickoffMessage
        projectId={projectId}
        chat={project.agent.telegramChatId}
        telegramReady={telegramConfigured()}
        sentAt={kickoff?.createdAt.toISOString() ?? null}
      />
      <AdminBrief
        projectId={projectId}
        origin={origin}
        initial={{
          token: brief.token,
          lang: BRIEF_LANGS.includes(brief.lang as BriefLang) ? (brief.lang as BriefLang) : "ru",
          status: brief.status,
          answers: brief.answers,
          notes: brief.notes,
          hidden: brief.hidden,
          files: brief.files.map((f) => f.name),
          clientSeenAt: brief.clientSeenAt?.toISOString() ?? null,
          submittedAt: brief.submittedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
