"use client";

import { useRef, useState } from "react";
import { Field, Segmented, Toast } from "@/components/workspace/form";
import { uid, useLocalState } from "@/components/workspace/use-local-state";
import { cn } from "@/lib/cn";
import {
  CREATIVE_STATUSES,
  GOOGLE_FORMAT_HINTS,
  GOOGLE_FORMATS,
  META_FORMATS,
  RSA_LIMITS,
  seedCreatives,
  type Creative,
  type CreativeFormat,
  type CreativePlatform,
  type CreativeStatus,
} from "./types";

interface Variant {
  hook: string;
  primaryText: string;
  headline: string;
}

/** Placeholder copy generator until the AI agent is connected. */
function draftVariants(offer: string, pain: string, tone: string): Variant[] {
  const o = offer.trim() || "наше предложение";
  const p = pain.trim() || "тратите время и деньги впустую";
  const soft = tone === "friendly";
  return [
    {
      hook: soft ? `Знакомо: ${p}?` : `Хватит: ${p}.`,
      primaryText: `${o}. Покажем, как это работает на вашем примере — без лишних звонков и обязательств.`,
      headline: "Узнать подробнее",
    },
    {
      hook: `3 причины, почему ${o.toLowerCase()} окупается`,
      primaryText: `Если вы ${p}, это решается за пару шагов. Оставьте заявку — пришлём расчёт сегодня.`,
      headline: "Получить расчёт",
    },
    {
      hook: `Мы проверили ${o.toLowerCase()} на 100+ клиентах`,
      primaryText: `Результат: меньше хаоса и понятные цифры. Пройдите короткий тест и получите план под себя.`,
      headline: "Пройти тест",
    },
  ];
}

/** Placeholder search-ad texts until the AI agent writes them: headlines ≤30, descriptions ≤90. */
function draftSearchAd(offer: string, pain: string): { headlines: string[]; descriptions: string[] } {
  const o = offer.trim() || "Консультация специалиста";
  const p = pain.trim();
  const cut = (v: string, n: number) => (v.length > n ? v.slice(0, n - 1).trimEnd() + "…" : v);
  return {
    headlines: [o, "Бесплатная консультация", "Ответим за 15 минут", "Работаем по всей стране", "Опыт 10+ лет", "Запишитесь сегодня"].map((h) =>
      cut(h, RSA_LIMITS.headlineChars),
    ),
    descriptions: [
      `${o}. Разберём вашу ситуацию и предложим решение — без лишних обязательств.`,
      p ? `Если вы ${p} — поможем это исправить. Оставьте заявку, перезвоним сегодня.` : "Оставьте заявку — перезвоним сегодня и ответим на вопросы.",
    ].map((d) => cut(d, RSA_LIMITS.descriptionChars)),
  };
}

const platformOf = (c: Creative): CreativePlatform => c.platform ?? "meta";

export function CreativesStudio({
  projectId,
  projectName,
  platform,
}: {
  projectId: string;
  projectName: string;
  /** Google = search ads (texts) + image/video assets in Google formats; Meta = creatives for feed/stories/reels. */
  platform: CreativePlatform;
}) {
  const [creatives, setCreatives] = useLocalState<Creative[]>(`creatives:${projectId}`, seedCreatives(projectName));
  const [filter, setFilter] = useState<CreativeStatus | "all">("all");
  const formats: readonly CreativeFormat[] = platform === "google" ? GOOGLE_FORMATS : META_FORMATS;
  const [format, setFormat] = useState<CreativeFormat>(formats[0]);
  const [offer, setOffer] = useState("");
  const [pain, setPain] = useState("");
  const [tone, setTone] = useState<"bold" | "friendly">("bold");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [pendingFile, setPendingFile] = useState<{ name: string; url: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    setPendingFile({ name: file.name, url: URL.createObjectURL(file) });
    if (file.type.startsWith("image/") && format.startsWith("Видео")) setFormat(platform === "google" ? "Горизонтальное 1.91:1" : "Квадрат 1:1");
    if (file.type.startsWith("video/") && !format.startsWith("Видео")) setFormat(platform === "google" ? "Видео YouTube 16:9" : "Видео 9:16");
  };

  const add = (v: Variant | null) => {
    const id = uid();
    const creative: Creative = {
      id,
      platform,
      kind: "creative",
      name: v?.hook.slice(0, 48) || pendingFile?.name || `Креатив ${creatives.length + 1}`,
      format,
      status: pendingFile ? "На согласовании" : "Идея",
      hook: v?.hook ?? "",
      primaryText: v?.primaryText ?? "",
      headline: v?.headline ?? "",
      fileName: pendingFile?.name ?? null,
      hue: Math.floor(Math.random() * 360),
      createdAt: new Date().toISOString(),
    };
    if (pendingFile) setPreviews((p) => ({ ...p, [id]: pendingFile.url }));
    setCreatives((list) => [creative, ...list]);
    setPendingFile(null);
    setToast("Креатив добавлен в библиотеку — его можно выбрать при сборке кампании.");
  };

  const setStatus = (id: string, status: CreativeStatus) =>
    setCreatives((list) => list.map((c) => (c.id === id ? { ...c, status } : c)));

  const mine = creatives.filter((c) => platformOf(c) === platform);
  const shown = filter === "all" ? mine : mine.filter((c) => c.status === filter);

  const addAd = (ad: { name: string; headlines: string[]; descriptions: string[]; path1: string; path2: string }) => {
    setCreatives((list) => [
      {
        id: uid(),
        platform: "google",
        kind: "ad",
        name: ad.name || ad.headlines[0] || `Объявление ${mine.length + 1}`,
        format: "Горизонтальное 1.91:1",
        status: "Идея",
        hook: ad.headlines[0] ?? "",
        primaryText: ad.descriptions[0] ?? "",
        headline: ad.headlines[0] ?? "",
        headlines: ad.headlines,
        descriptions: ad.descriptions,
        path1: ad.path1,
        path2: ad.path2,
        fileName: null,
        hue: Math.floor(Math.random() * 360),
        createdAt: new Date().toISOString(),
      },
      ...list,
    ]);
    setToast("Объявление сохранено — его тексты можно подставить при сборке поисковой кампании Google.");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
          <div>
            <h2 className="section-title">{platform === "google" ? "Креативы Google" : "Загрузить креатив"}</h2>
            {platform === "google" && (
              <p className="mt-1 text-sm text-muted-foreground">Картинки и видео для Performance Max, Demand Gen, Демонстрационной сети и YouTube.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex min-h-44 flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed px-4 text-center transition-colors",
              dragging ? "border-ring bg-muted" : "border-border hover:bg-muted/50",
            )}
          >
            {pendingFile ? (
              <>
                <span className="text-sm font-semibold">{pendingFile.name}</span>
                <span className="text-xs text-muted-foreground">Файл выбран — выберите формат и добавьте в библиотеку</span>
              </>
            ) : (
              <>
                <span className="text-base font-semibold">Перетащите видео или картинку сюда</span>
                <span className="text-xs text-muted-foreground">или нажмите, чтобы выбрать (MP4, MOV, JPG, PNG)</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <Field label="Формат" hint={platform === "google" ? GOOGLE_FORMAT_HINTS[format] : undefined}>
            <select className="field" value={format} onChange={(e) => setFormat(e.target.value as CreativeFormat)}>
              {formats.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
          <div>
            <button type="button" className="btn-primary" disabled={!pendingFile} onClick={() => add(null)}>
              Добавить в библиотеку
            </button>
          </div>
        </section>

        {platform === "google" ? (
          <SearchAdBuilder onSave={addAd} />
        ) : (
        <section className="flex min-w-0 flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
          <div>
            <h2 className="section-title">Бриф и тексты</h2>
            <p className="mt-1 text-sm text-muted-foreground">Агент предложит хуки, основной текст и заголовок под формат.</p>
          </div>
          <Field label="Оффер">
            <input className="field" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Бесплатная консультация по ипотеке" />
          </Field>
          <Field label="Боль / выгода клиента">
            <input className="field" value={pain} onChange={(e) => setPain(e.target.value)} placeholder="переплачиваете банку проценты" />
          </Field>
          <Segmented
            value={tone}
            onChange={setTone}
            options={[
              { value: "bold", label: "Дерзко" },
              { value: "friendly", label: "Дружелюбно" },
            ]}
          />
          <div>
            <button type="button" className="btn-primary" onClick={() => setVariants(draftVariants(offer, pain, tone))}>
              Сгенерировать варианты
            </button>
          </div>
          {variants.length > 0 && (
            <ul className="flex flex-col gap-2">
              {variants.map((v, i) => (
                <li key={i} className="rounded-[18px] border border-border bg-background/60 p-3">
                  <p className="text-sm font-semibold">{v.hook}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{v.primaryText}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{v.headline}</span>
                    <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => add(v)}>
                      + В библиотеку
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </div>

      <section className="min-w-0 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">
            {platform === "google" ? "Объявления и креативы Google" : "Библиотека Meta"} · {mine.length}
          </h2>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[{ value: "all" as const, label: "Все" }, ...CREATIVE_STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Здесь пока пусто.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {shown.map((c) => (
              <article key={c.id} className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border bg-background/60">
                {c.kind === "ad" ? (
                  <div className="flex aspect-square flex-col gap-1 overflow-hidden bg-card p-3 text-left">
                    <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">Поисковое объявление</span>
                    <span className="mt-1 line-clamp-2 text-sm font-semibold text-[#1a0dab] dark:text-[#8ab4f8]">
                      {(c.headlines ?? []).slice(0, 3).join(" | ")}
                    </span>
                    <span className="line-clamp-3 text-xs text-muted-foreground">{(c.descriptions ?? []).join(" ")}</span>
                    <span className="mt-auto text-[10px] text-muted-foreground">
                      {c.headlines?.length ?? 0} заголовков · {c.descriptions?.length ?? 0} описаний
                    </span>
                  </div>
                ) : (
                <div
                  className={cn("relative flex items-end p-2", c.format.includes("9:16") ? "aspect-[4/5]" : "aspect-square")}
                  style={
                    previews[c.id]
                      ? undefined
                      : { background: `linear-gradient(150deg, hsl(${c.hue} 65% 52%), hsl(${(c.hue + 60) % 360} 60% 22%))` }
                  }
                >
                  {previews[c.id] &&
                    (c.fileName && /\.(mp4|mov|webm)$/i.test(c.fileName) ? (
                      <video src={previews[c.id]} className="absolute inset-0 size-full object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                      <img src={previews[c.id]} alt="" className="absolute inset-0 size-full object-cover" />
                    ))}
                  <span className="relative rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">{c.format}</span>
                </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-semibold">{c.name}</p>
                  {c.kind !== "ad" && c.primaryText && <p className="line-clamp-2 text-xs text-muted-foreground">{c.primaryText}</p>}
                  <div className="mt-auto flex items-center gap-1">
                    <select
                      aria-label="Статус"
                      className="field py-1 text-xs"
                      value={c.status}
                      onChange={(e) => setStatus(c.id, e.target.value as CreativeStatus)}
                    >
                      {CREATIVE_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1 text-xs text-negative"
                      aria-label="Удалить"
                      onClick={() => setCreatives((list) => list.filter((x) => x.id !== c.id))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

/** Google responsive search ad: up to 15 headlines (≤30 chars) and 4 descriptions (≤90), display path. */
function SearchAdBuilder({
  onSave,
}: {
  onSave: (ad: { name: string; headlines: string[]; descriptions: string[]; path1: string; path2: string }) => void;
}) {
  const [offer, setOffer] = useState("");
  const [pain, setPain] = useState("");
  const [headlines, setHeadlines] = useState<string[]>(["", "", ""]);
  const [descriptions, setDescriptions] = useState<string[]>(["", ""]);
  const [path1, setPath1] = useState("");
  const [path2, setPath2] = useState("");
  const filledH = headlines.map((h) => h.trim()).filter(Boolean);
  const filledD = descriptions.map((d) => d.trim()).filter(Boolean);
  const tooLong =
    headlines.some((h) => h.length > RSA_LIMITS.headlineChars) ||
    descriptions.some((d) => d.length > RSA_LIMITS.descriptionChars) ||
    path1.length > RSA_LIMITS.pathChars ||
    path2.length > RSA_LIMITS.pathChars;
  const ready = filledH.length >= 3 && filledD.length >= 2 && !tooLong;

  const counter = (len: number, max: number) => (
    <span className={cn("w-12 shrink-0 text-right text-[11px] tabular-nums", len > max ? "text-negative" : "text-muted-foreground")}>
      {len}/{max}
    </span>
  );

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
      <div>
        <h2 className="section-title">Объявления для поиска</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Адаптивное поисковое объявление: Google сам собирает комбинации из заголовков и описаний. Минимум 3 заголовка и 2 описания.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Оффер">
          <input className="field" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Налоговый консультант в Испании" />
        </Field>
        <Field label="Боль / выгода клиента">
          <input className="field" value={pain} onChange={(e) => setPain(e.target.value)} placeholder="боитесь штрафов от налоговой" />
        </Field>
      </div>
      <div>
        <button
          type="button"
          className="btn-ghost border border-border px-3 py-1.5 text-xs"
          onClick={() => {
            const d = draftSearchAd(offer, pain);
            setHeadlines(d.headlines);
            setDescriptions(d.descriptions);
          }}
        >
          Набросать тексты
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">
          Заголовки · {filledH.length}/{RSA_LIMITS.headlines}
        </span>
        {headlines.map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="field"
              value={h}
              placeholder={`Заголовок ${i + 1}`}
              onChange={(e) => setHeadlines(headlines.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {counter(h.length, RSA_LIMITS.headlineChars)}
          </div>
        ))}
        {headlines.length < RSA_LIMITS.headlines && (
          <button type="button" className="btn-ghost self-start px-3 py-1 text-xs" onClick={() => setHeadlines([...headlines, ""])}>
            + Заголовок
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">
          Описания · {filledD.length}/{RSA_LIMITS.descriptions}
        </span>
        {descriptions.map((d, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              rows={2}
              className="field resize-y"
              value={d}
              placeholder={`Описание ${i + 1}`}
              onChange={(e) => setDescriptions(descriptions.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {counter(d.length, RSA_LIMITS.descriptionChars)}
          </div>
        ))}
        {descriptions.length < RSA_LIMITS.descriptions && (
          <button type="button" className="btn-ghost self-start px-3 py-1 text-xs" onClick={() => setDescriptions([...descriptions, ""])}>
            + Описание
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Путь 1" hint={`— до ${RSA_LIMITS.pathChars}`}>
          <input className="field" value={path1} onChange={(e) => setPath1(e.target.value)} placeholder="nalogi" />
        </Field>
        <Field label="Путь 2" hint={`— до ${RSA_LIMITS.pathChars}`}>
          <input className="field" value={path2} onChange={(e) => setPath2(e.target.value)} placeholder="konsultaciya" />
        </Field>
      </div>

      {filledH.length > 0 && (
        <div className="rounded-[18px] border border-border bg-background/60 p-3 text-sm">
          <span className="text-[11px] text-muted-foreground">Пример показа · Реклама</span>
          <p className="mt-0.5 font-semibold text-[#1a0dab] dark:text-[#8ab4f8]">{filledH.slice(0, 3).join(" | ")}</p>
          <p className="text-xs text-positive">сайт.com{path1 ? `/${path1}` : ""}{path2 ? `/${path2}` : ""}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{filledD.slice(0, 2).join(" ")}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={!ready}
          onClick={() => {
            onSave({ name: offer.trim() || filledH[0], headlines: filledH, descriptions: filledD, path1: path1.trim(), path2: path2.trim() });
            setHeadlines(["", "", ""]);
            setDescriptions(["", ""]);
          }}
        >
          Сохранить объявление
        </button>
        {!ready && <span className="text-xs text-muted-foreground">{tooLong ? "Есть тексты длиннее лимита." : "Нужно минимум 3 заголовка и 2 описания."}</span>}
      </div>
    </section>
  );
}
