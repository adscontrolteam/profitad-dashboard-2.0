import type { Metadata } from "next";
import { Suspense } from "react";
import { NetworkIcon } from "@/components/smm/network-icon";
import { Logo } from "@/components/ui/logo";
import { providerConfigured, type Provider } from "@/lib/social/oauth";
import { listSocialAccounts, projectByConnectToken, touchConnectLink, type SocialAccountView } from "@/lib/social/store";

export const metadata: Metadata = { title: "Подключение соцсетей", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  denied: "Вы закрыли окно без разрешения — аккаунт не подключён. Можно попробовать ещё раз.",
  empty: "Вход прошёл, но ни одной страницы не выбрано. Нажмите «Подключить» ещё раз и отметьте нужные страницы и аккаунт Instagram.",
  failed: "Не получилось подключить аккаунт. Попробуйте ещё раз, а если не выйдет — напишите нам.",
  setup: "Эта соцсеть пока не готова к подключению на нашей стороне. Напишите нам — мы сообщим, когда можно будет.",
};

/** Public page: the client connects the project's Facebook Page, Instagram and Threads. No sign-in — the secret link is the key. */
export default function ConnectPage({ params, searchParams }: PageProps<"/connect/[token]">) {
  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <Logo className="w-36" />
        <Suspense fallback={<p className="text-sm text-muted-foreground">…</p>}>
          <Connect params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Connect({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const query = await searchParams;
  const project = await projectByConnectToken(token);
  if (!project) return <p className="rounded-2xl border border-border bg-card p-6 text-sm">Ссылка не найдена или больше не действует. Попросите у нас новую.</p>;
  await touchConnectLink(project.projectId).catch(() => undefined);
  const accounts = await listSocialAccounts(project.projectId);
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;
  const of = (...networks: SocialAccountView["network"][]) => accounts.filter((a) => networks.includes(a.network));

  return (
    <>
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Подключение соцсетей · {project.name}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Два шага, около двух минут. Вы входите в свой аккаунт на сайте самой соцсети и разрешаете нам видеть статистику и публиковать
          посты. Пароль мы не видим и не храним, доступ можно отозвать в любой момент в настройках соцсети.
        </p>
      </header>

      {error && <p className="rounded-2xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm">{error}</p>}
      {typeof query.done === "string" && !error && (
        <p className="rounded-2xl border border-positive/40 bg-positive/10 px-4 py-3 text-sm">Готово, аккаунт подключён. Спасибо!</p>
      )}

      <Step
        n={1}
        title="Facebook и Instagram"
        text="Войдите в Facebook и отметьте страницу компании и связанный с ней аккаунт Instagram. Instagram должен быть профессиональным (бизнес или автор) и привязан к странице Facebook."
        provider="meta"
        token={token}
        accounts={of("facebook", "instagram")}
      />
      <Step
        n={2}
        title="Threads"
        text="Войдите в аккаунт Threads компании и нажмите «Разрешить». Перед этим примите наше приглашение: Threads → Настройки → Аккаунт → Разрешения для сайтов → Приглашения."
        provider="threads"
        token={token}
        accounts={of("threads")}
      />
    </>
  );
}

function Step({ n, title, text, provider, token, accounts }: { n: number; title: string; text: string; provider: Provider; token: string; accounts: SocialAccountView[] }) {
  const ready = providerConfigured(provider);
  const broken = accounts.some((a) => a.status === "error");
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-semibold">{n}</span>
        <h2 className="section-title">{title}</h2>
        {accounts.length > 0 && !broken && <span className="rounded-full bg-positive/12 px-2.5 py-0.5 text-xs font-medium text-positive">Подключено</span>}
        {broken && <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">Нужно подключить заново</span>}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
      {accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={`${a.network}:${a.externalId}`} className="flex items-center gap-2 text-sm">
              <NetworkIcon network={a.network} className="size-4 shrink-0" />
              <span className="font-medium [overflow-wrap:anywhere]">{a.name}</span>
            </li>
          ))}
        </ul>
      )}
      {ready ? (
        <a href={`/api/connect/${provider}/start?t=${token}`} className={accounts.length && !broken ? "btn-ghost w-fit border border-border px-3 py-1.5 text-sm" : "btn-primary w-fit"}>
          {accounts.length ? "Подключить ещё или заново" : "Подключить"}
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">Скоро: мы заканчиваем настройку на своей стороне.</p>
      )}
    </section>
  );
}
