"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { connectBusinessPagesAction, disconnectSocialAction, listBusinessPagesAction, rotateConnectLinkAction } from "@/app/(dashboard)/smm/connect-actions";
import { NetworkIcon } from "@/components/smm/network-icon";
import { InfoHint } from "@/components/ui/info-hint";
import type { BusinessPageView } from "@/lib/social/business";
import type { SocialAccountView } from "@/lib/social/store";

const LABEL: Record<SocialAccountView["network"], string> = { facebook: "Facebook", instagram: "Instagram", threads: "Threads" };

/** Our side: the link we send to the client and the accounts they connected through it. */
export function SocialConnections({
  projectId,
  origin,
  token,
  seenAt,
  accounts: initial,
  ready,
  canManage,
}: {
  projectId: string;
  origin: string;
  /** Null for viewers who cannot manage the link. */
  token: string | null;
  seenAt: string | null;
  accounts: SocialAccountView[];
  ready: { meta: boolean; threads: boolean; business: boolean };
  canManage: boolean;
}) {
  const [link, setLink] = useState(token ? `${origin}/connect/${token}` : null);
  const [accounts, setAccounts] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  /** Other screens («Вводные», SMM) keep their own copy of the list: refresh it after a change. */
  const router = useRouter();
  /** Picker of our Business Manager's Pages: null = closed. */
  const [pages, setPages] = useState<BusinessPageView[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const connectedPages = new Set(accounts.filter((a) => a.network === "facebook").map((a) => a.externalId));
  const openPicker = () =>
    start(async () => {
      setPickerError(null);
      const res = await listBusinessPagesAction(projectId);
      if (res.ok && res.pages) {
        setPages(res.pages);
        setPicked([]);
      } else setPickerError(res.error ?? "Не удалось получить список страниц.");
    });
  const fmt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const missing = [!ready.meta && "Facebook и Instagram", !ready.threads && "Threads"].filter(Boolean).join(", ");

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title">Соцсети проекта</h2>
        <InfoHint>
          Клиент открывает ссылку без регистрации, входит в Facebook и Threads на их сайтах и разрешает доступ. Пароли к нам не попадают:
          мы храним только зашифрованный ключ доступа. Ключ Threads живёт 60 дней и продлевается автоматически.
        </InfoHint>
        {link && <span className="text-xs text-muted-foreground">{seenAt ? `клиент открывал ${fmt(seenAt)}` : "клиент ещё не открывал"}</span>}
      </div>

      {accounts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={`${a.network}:${a.externalId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-border bg-background/70 px-3 py-2 text-sm">
              <NetworkIcon network={a.network} className="size-4 shrink-0" />
              <span className="text-muted-foreground">{LABEL[a.network]}</span>
              <span className="font-medium [overflow-wrap:anywhere]">{a.name}</span>
              {a.status === "error" ? (
                <span className="rounded-full bg-negative/12 px-2 py-0.5 text-xs font-medium text-negative" title={a.lastError ?? undefined}>
                  нужно подключить заново
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">с {fmt(a.connectedAt)}</span>
              )}
              {canManage && (
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Отключить ${LABEL[a.network]} ${a.name}?`)) return;
                    start(async () => {
                      const res = await disconnectSocialAction(projectId, a.network, a.externalId);
                      if (!res.ok) return;
                      setAccounts((list) => list.filter((x) => !(x.network === a.network && x.externalId === a.externalId)));
                      router.refresh();
                    });
                  }}
                >
                  Отключить
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Пока ничего не подключено. {ready.business && canManage ? "Выберите страницы из Business Manager или отправьте клиенту ссылку ниже." : "Отправьте клиенту ссылку ниже."}
        </p>
      )}

      {ready.business && canManage && (
        <div className="flex flex-col gap-3">
          {pages === null ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" disabled={pending} onClick={openPicker}>
                {pending ? "Загружаем…" : "Выбрать из Business Manager"}
              </button>
              <InfoHint>
                Facebook и Instagram берутся из нашего Business Manager: клиенту достаточно дать нам партнёрский доступ к странице, входить
                никуда не нужно. В списке — страницы, назначенные системному пользователю. Threads так подключить нельзя, для него нужна ссылка.
              </InfoHint>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-background/70 p-3">
              <p className="text-sm font-medium">Страницы из Business Manager</p>
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {pages.map((p) => {
                  const already = connectedPages.has(p.id);
                  return (
                    <li key={p.id}>
                      <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] px-2 py-1.5 text-sm hover:bg-muted/60">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={already || picked.includes(p.id)}
                          disabled={already || pending}
                          onChange={(e) => setPicked((list) => (e.target.checked ? [...list, p.id] : list.filter((id) => id !== p.id)))}
                        />
                        <span className="font-medium [overflow-wrap:anywhere]">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.instagram ? `Instagram ${p.instagram}` : "без Instagram"}</span>
                        {already && <span className="text-xs text-muted-foreground">· уже подключена</span>}
                        {p.usedBy.length > 0 && <span className="text-xs text-warning">· в проекте {p.usedBy.join(", ")}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending || picked.length === 0}
                  onClick={() =>
                    start(async () => {
                      setPickerError(null);
                      const res = await connectBusinessPagesAction(projectId, picked);
                      if (res.ok && res.accounts) {
                        setAccounts(res.accounts);
                        setPages(null);
                        router.refresh();
                      } else setPickerError(res.error ?? "Не удалось подключить.");
                    })
                  }
                >
                  {pending ? "Подключаем…" : `Подключить выбранные${picked.length ? ` (${picked.length})` : ""}`}
                </button>
                <button type="button" className="btn-ghost border border-border px-3 py-1.5" disabled={pending} onClick={() => setPages(null)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
          {pickerError && <p className="rounded-[14px] border border-negative/40 bg-negative/10 px-3 py-2 text-xs leading-5">{pickerError}</p>}
        </div>
      )}

      {link && (
        <div className="flex flex-wrap gap-2">
          <input readOnly className="field min-w-0 flex-1 text-sm" value={link} onFocus={(e) => e.target.select()} aria-label="Ссылка для клиента" />
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Скопировано ✓" : "Скопировать"}
          </button>
          <a href={link} target="_blank" rel="noreferrer" className="btn-ghost border border-border px-3 py-1.5">
            Как видит клиент
          </a>
          <button
            type="button"
            className="btn-ghost border border-border px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => {
              if (!confirm("Выдать новую ссылку? Старая перестанет работать, подключённые аккаунты останутся.")) return;
              start(async () => {
                const res = await rotateConnectLinkAction(projectId);
                if (res.ok && res.token) setLink(`${origin}/connect/${res.token}`);
              });
            }}
          >
            Новая ссылка
          </button>
        </div>
      )}

      {missing && canManage && (
        <p className="rounded-[14px] border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5">
          Не настроено на нашей стороне: {missing}. Нужны ключи приложения Meta в Vercel — см. docs/setup-meta-app.md. До этого клиент увидит по ссылке «скоро».
        </p>
      )}
    </section>
  );
}
