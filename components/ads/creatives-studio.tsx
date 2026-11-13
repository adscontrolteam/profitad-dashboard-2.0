"use client";

import { useRef, useState } from "react";
import { Field, Segmented, Toast } from "@/components/workspace/form";
import { uid, useLocalState } from "@/components/workspace/use-local-state";
import { cn } from "@/lib/cn";
import {
  CREATIVE_FORMATS,
  CREATIVE_STATUSES,
  seedCreatives,
  type Creative,
  type CreativeFormat,
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

export function CreativesStudio({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [creatives, setCreatives] = useLocalState<Creative[]>(`creatives:${projectId}`, seedCreatives(projectName));
  const [filter, setFilter] = useState<CreativeStatus | "all">("all");
  const [format, setFormat] = useState<CreativeFormat>("Видео 9:16");
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
    if (file.type.startsWith("image/") && format.startsWith("Видео")) setFormat("Квадрат 1:1");
  };

  const add = (v: Variant | null) => {
    const id = uid();
    const creative: Creative = {
      id,
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

  const shown = filter === "all" ? creatives : creatives.filter((c) => c.status === filter);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
          <h2 className="section-title">Загрузить креатив</h2>
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
          <Field label="Формат">
            <select className="field" value={format} onChange={(e) => setFormat(e.target.value as CreativeFormat)}>
              {CREATIVE_FORMATS.map((f) => (
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
      </div>

      <section className="min-w-0 rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow)] sm:p-5 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Библиотека · {creatives.length}</h2>
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
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-semibold">{c.name}</p>
                  {c.primaryText && <p className="line-clamp-2 text-xs text-muted-foreground">{c.primaryText}</p>}
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
