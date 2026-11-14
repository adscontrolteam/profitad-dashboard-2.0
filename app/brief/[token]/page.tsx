import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientBrief } from "@/components/brief/client-brief";
import { Logo } from "@/components/ui/logo";
import { BRIEF_LANGS, BRIEF_UI, type BriefLang } from "@/lib/brief/questions";
import { getBriefByToken, touchSeen } from "@/lib/brief/store";

export const metadata: Metadata = { title: "Бриф проекта", robots: { index: false, follow: false } };

/** Public page of a project's brief. No sign-in: the secret link is the key; nothing else of the dashboard is reachable from here. */
export default function BriefPage({ params }: PageProps<"/brief/[token]">) {
  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <Logo className="w-36" />
        <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
          <Brief params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Brief({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getBriefByToken(token);
  if (!found) {
    return <p className="rounded-2xl border border-border bg-card p-6 text-sm">{BRIEF_UI.ru.notFound}</p>;
  }
  const { brief, name } = found;
  const lang: BriefLang = BRIEF_LANGS.includes(brief.lang as BriefLang) ? (brief.lang as BriefLang) : "ru";
  const ui = BRIEF_UI[lang];
  await touchSeen(brief.projectId).catch(() => undefined);
  // Hidden questions and internal notes never leave the server.
  const answers = Object.fromEntries(Object.entries(brief.answers).filter(([id]) => !brief.hidden.includes(id)));

  return (
    <>
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">
          {ui.title} · {name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{ui.intro}</p>
      </header>
      <ClientBrief token={token} lang={lang} initial={answers} hidden={brief.hidden} status={brief.status} files={brief.files.map((f) => f.name)} />
    </>
  );
}
