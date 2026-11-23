"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { SmmAnalyticsData } from "@/lib/social/report";

/**
 * The SMM analytics of a connected account in four tabs: «Обзор» (views, followers, follows vs unfollows),
 * «Контент» (formats, content types, interactions, best publications by a chosen measure), «Аудитория» and «Сообщения».
 * «Сообщения» shows the funnel steps ManyChat automations report (see «Вводные»).
 */
type Post = SmmAnalyticsData["posts"][number];
type Tab = "overview" | "content" | "audience" | "messages";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "content", label: "Контент" },
  { id: "audience", label: "Аудитория" },
  { id: "messages", label: "Сообщения" },
];

const nf = (v: number) => Math.round(v).toLocaleString("ru-RU");
const pf = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${nf(Math.abs(v))}`;
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const sumOf = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((a, r) => a + pick(r), 0);
const interactions = (p: Post) => p.likes + p.comments + p.shares + p.saves;

/** A smooth line through the points (Catmull-Rom → Bezier). */
function smooth(pts: [number, number][]) {
  if (!pts.length) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A round step for the axis that gives about four lines up to `max`. */
function niceStep(max: number) {
  const raw = Math.max(1, max) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-pressed={value === it.id}
          onClick={() => onChange(it.id)}
          className={cn("rounded-full px-3.5 py-1.5 text-[13px] transition-colors", value === it.id ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Delta({ now, before, points = false }: { now: number; before: number | null; points?: boolean }) {
  if (before === null || (!points && before <= 0)) return null;
  const diff = points ? now - before : (now / before - 1) * 100;
  const text = points ? `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1).replace(".", ",")} п.п.` : `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(0)} %`;
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", diff >= 0 ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative")}>
      {text}
    </span>
  );
}

function Kpi({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[22px] border border-border bg-card px-4 py-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-[family-name:var(--font-manrope)] text-[26px] leading-8 font-bold tracking-[-0.03em] tabular-nums">{value}</span>
      {children && <span>{children}</span>}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Line({ label, value, share, color = "var(--accent)" }: { label: React.ReactNode; value: string; share: number; color?: string }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-[13px]">
        <span className="min-w-0">{label}</span>
        <b className="shrink-0 tabular-nums">{value}</b>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, share))}%`, background: color }} />
      </div>
    </div>
  );
}

function Tip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-60 -translate-x-1/2 -translate-y-full rounded-xl bg-foreground px-3 py-2 text-xs leading-[1.45] text-background"
      style={{ left: `${Math.max(14, Math.min(86, x))}%`, top: `${y}%` }}
    >
      {children}
    </div>
  );
}

/* ---------- Views and reach ---------- */

function ViewsChart({ data }: { data: SmmAnalyticsData }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = data.days;
  const W = 800;
  const H = 260;
  const L = 48;
  const R = 10;
  const T = 14;
  const B = 28;
  const step = niceStep(Math.max(...days.map((d) => d.views), 1));
  const max = step * 4;
  const x = (i: number) => (days.length > 1 ? L + (i * (W - L - R)) / (days.length - 1) : (L + W - R) / 2);
  const y = (v: number) => T + (1 - Math.min(v, max) / max) * (H - T - B);
  const postDays = useMemo(() => new Map(data.posts.map((p) => [p.date, p])), [data.posts]);
  const views = days.map((d, i): [number, number] => [x(i), y(d.views)]);
  const reach = days.map((d, i): [number, number] => [x(i), y(d.reach)]);
  const hasReach = days.some((d) => d.reach > 0);
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));
  const h = hover !== null ? days[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Просмотры и охват по дням"
        className="block h-auto w-full overflow-visible"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - L) / (W - L - R)) * (days.length - 1)))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 1, 2, 3, 4].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g * step)} y2={y(g * step)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 8} y={y(g * step) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
              {g * step >= 1000 ? `${((g * step) / 1000).toLocaleString("ru-RU")} тыс.` : g * step}
            </text>
          </g>
        ))}
        {views.length > 1 && <path d={`${smooth(views)} L${x(days.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill="var(--accent)" opacity={0.08} />}
        {hasReach && <path d={smooth(reach)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />}
        <path d={smooth(views)} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        {days.map((d, i) => (
          <g key={d.date}>
            {(i % labelEvery === 0 || i === days.length - 1) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                {dayLabel(d.date)}
              </text>
            )}
            {postDays.has(d.date) && <circle cx={x(i)} cy={y(d.views)} r={5.5} fill="var(--highlight)" stroke="var(--card)" strokeWidth={2} />}
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted-foreground)" strokeWidth={1} />}
      </svg>
      {h && hover !== null && (
        <Tip x={(x(hover) / W) * 100} y={(y(h.views) / H) * 100 - 4}>
          <b>{dayLabel(h.date)}</b>
          <br />
          {nf(h.views)} просмотров{hasReach ? ` · охват ${nf(h.reach)}` : ""}
          {postDays.has(h.date) && (
            <>
              <br />
              {postDays.get(h.date)!.kind}: {postDays.get(h.date)!.title}
            </>
          )}
        </Tip>
      )}
    </div>
  );
}

/* ---------- Follows and unfollows ---------- */

function FollowsChart({ data }: { data: SmmAnalyticsData }) {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [hover, setHover] = useState<number | null>(null);
  const known = data.days.filter((d) => d.follows !== null || d.unfollows !== null);
  const up = sumOf(known, (d) => d.follows ?? 0);
  const down = sumOf(known, (d) => d.unfollows ?? 0);

  const rows = useMemo(() => {
    const days = data.days.map((d) => ({ label: dayLabel(d.date), up: d.follows ?? 0, down: d.unfollows ?? 0, posts: data.posts.filter((p) => p.date === d.date) }));
    if (mode === "day") return days;
    const out: typeof days = [];
    for (let i = 0; i < days.length; i += 7) {
      const w = days.slice(i, i + 7);
      out.push({ label: `${w[0].label} — ${w.at(-1)!.label}`, up: sumOf(w, (d) => d.up), down: sumOf(w, (d) => d.down), posts: w.flatMap((d) => d.posts) });
    }
    return out;
  }, [data.days, data.posts, mode]);

  if (!known.length)
    return (
      <Card>
        <h2 className="section-title">Подписки и отписки</h2>
        <p className="mt-3 text-sm text-muted-foreground">Соцсеть не отдала подписки и отписки за этот период. Чистый прирост считается по ежедневным замерам числа подписчиков.</p>
      </Card>
    );

  const W = 800;
  const H = 250;
  const L = 48;
  const R = 10;
  const T = 26;
  const B = 26;
  const stepV = niceStep(Math.max(...rows.map((r) => Math.max(r.up, r.down)), 1) * 2) / 2 || 1;
  const top = Math.max(stepV, Math.ceil(Math.max(...rows.map((r) => r.up)) / stepV) * stepV);
  const bottom = Math.max(stepV, Math.ceil(Math.max(...rows.map((r) => r.down)) / stepV) * stepV);
  const k = (H - T - B) / (top + bottom);
  const mid = T + top * k;
  const step = (W - L - R) / rows.length;
  const bw = Math.max(4, Math.min(mode === "week" ? 46 : 12, step - 6));
  const cx = (i: number) => L + step * i + step / 2;
  const line = rows.map((r, i): [number, number] => [cx(i), mid - (r.up - r.down) * k]);
  const best = rows.reduce((b, r, i) => (r.up - r.down > rows[b].up - rows[b].down ? i : b), 0);
  const worst = rows.reduce((b, r, i) => (r.down > rows[b].down ? i : b), 0);
  const labelEvery = mode === "week" ? 1 : Math.max(1, Math.ceil(rows.length / 7));
  const grid: number[] = [];
  for (let g = top; g >= -bottom; g -= stepV) grid.push(g);
  const h = hover !== null ? rows[hover] : null;

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="section-title">Подписки и отписки</h2>
        <span className="flex-1" />
        <Seg value={mode} onChange={(m) => (setMode(m), setHover(null))} label="Шаг графика" items={[{ id: "day", label: "По дням" }, { id: "week", label: "По неделям" }]} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        {[
          { label: "Пришли", value: `+${nf(up)}`, className: "text-positive" },
          { label: "Ушли", value: `−${nf(down)}`, className: "text-negative" },
          { label: "Итог", value: signed(up - down), className: "" },
          { label: "Удержание", value: up ? `${Math.round((1 - down / up) * 100)} %` : "—", className: "" },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn("font-[family-name:var(--font-manrope)] text-[22px] leading-7 font-bold tracking-[-0.03em] tabular-nums", s.className)}>{s.value}</div>
          </div>
        ))}
        <span className="flex-1" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-positive align-[-1px]" />подписались</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-negative align-[-1px]" />отписались</span>
          <span><i className="mr-1.5 inline-block h-0.5 w-3.5 bg-foreground align-[3px]" />итог</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-highlight align-[-1px]" />публикация</span>
        </div>
      </div>
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Подписки и отписки" className="block h-auto w-full overflow-visible" onMouseLeave={() => setHover(null)}>
          {grid.map((g) => (
            <g key={g}>
              <line x1={L} x2={W - R} y1={mid - g * k} y2={mid - g * k} stroke="var(--border)" strokeWidth={1} strokeDasharray={g ? "2 5" : undefined} />
              <text x={L - 8} y={mid - g * k + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
                {g > 0 ? "+" : g < 0 ? "−" : ""}
                {nf(Math.abs(g))}
              </text>
            </g>
          ))}
          {rows.map((r, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={L + step * i} y={T} width={step} height={H - T - B} fill="var(--foreground)" opacity={hover === i ? 0.05 : 0} />
              <rect x={cx(i) - bw / 2} y={mid - r.up * k} width={bw} height={r.up * k} rx={Math.min(5, bw / 2)} fill="var(--positive)" opacity={0.85} />
              <rect x={cx(i) - bw / 2} y={mid + 1} width={bw} height={r.down * k} rx={Math.min(5, bw / 2)} fill="var(--negative)" opacity={0.85} />
              {mode === "day" && r.posts.length > 0 && <circle cx={cx(i)} cy={mid - r.up * k - 9} r={3.5} fill="var(--highlight)" stroke="var(--card)" strokeWidth={1.5} />}
              {(i % labelEvery === 0 || i === rows.length - 1) && (
                <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                  {r.label}
                </text>
              )}
            </g>
          ))}
          <path d={smooth(line)} fill="none" stroke="var(--foreground)" strokeWidth={1.75} pointerEvents="none" />
          {mode === "day" && rows.length > 2 && (
            <g pointerEvents="none" fontSize={11} fontWeight={600} fill="var(--foreground)">
              <circle cx={line[best][0]} cy={line[best][1]} r={4} />
              <text x={Math.max(L + 60, Math.min(W - 70, line[best][0]))} y={T - 10} textAnchor="middle">
                лучший день {signed(rows[best].up - rows[best].down)}
              </text>
              {rows[worst].down > 0 && (
                <text x={Math.max(L + 60, Math.min(W - 70, cx(worst)))} y={mid + rows[worst].down * k + 15} textAnchor="middle">
                  пик отписок −{nf(rows[worst].down)}
                </text>
              )}
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <Tip x={(cx(hover) / W) * 100} y={((mid - h.up * k) / H) * 100 - 3}>
            <b>{h.label}</b>
            <br />
            подписались +{nf(h.up)} · отписались −{nf(h.down)}
            <br />
            итог {signed(h.up - h.down)}
            {h.posts.length > 0 && (
              <>
                <br />
                {mode === "day" ? `${h.posts[0].kind}: ${h.posts[0].title}` : `публикаций: ${h.posts.length}`}
              </>
            )}
          </Tip>
        )}
      </div>
    </Card>
  );
}

/* ---------- Tabs ---------- */

function Overview({ data }: { data: SmmAnalyticsData }) {
  const views = sumOf(data.days, (d) => d.views);
  const reach = sumOf(data.days, (d) => d.reach);
  const known = data.days.filter((d) => d.follows !== null);
  const up = sumOf(known, (d) => d.follows ?? 0);
  const down = sumOf(data.days, (d) => d.unfollows ?? 0);
  const postViews = sumOf(data.posts, (p) => p.views);
  const er = postViews ? (sumOf(data.posts, interactions) / postViews) * 100 : 0;
  const prevEr = data.prev.postViews && data.prev.interactions !== null ? (data.prev.interactions / data.prev.postViews) * 100 : null;
  const saves = sumOf(data.posts, (p) => p.saves);
  const shares = sumOf(data.posts, (p) => p.shares);
  const perPost = (v: number) => (data.posts.length ? `${nf(v / data.posts.length)} на публикацию` : "публикаций нет");
  const facts: [string, string][] = [];
  if (known.length) {
    facts.push(["Чистый прирост", signed(up - down)]);
    if (views) facts.push(["Подписок на 1000 просмотров", ((up / views) * 1000).toFixed(1).replace(".", ",")]);
  }
  if (data.profileViews !== null) facts.push(["Посещения профиля", nf(data.profileViews)]);
  if (data.linkTaps !== null) facts.push(["Переходы по ссылке", nf(data.linkTaps)]);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <div className="text-[13px] text-muted-foreground">Просмотры за период</div>
              <div className="font-[family-name:var(--font-manrope)] text-[44px] leading-[46px] font-bold tracking-[-0.04em] tabular-nums">{nf(views)}</div>
            </div>
            <div className="flex flex-col gap-1 pb-1">
              <Delta now={views} before={data.prev.views} />
              <span className="text-xs text-muted-foreground">в среднем {nf(views / Math.max(1, data.days.length))} в день</span>
            </div>
            <span className="flex-1" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-accent align-[-1px]" />просмотры</span>
              <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-muted-foreground/70 align-[-1px]" />охват</span>
              <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-highlight align-[-1px]" />день публикации</span>
            </div>
          </div>
          <div className="mt-4">
            <ViewsChart data={data} />
          </div>
          {!data.dailyViews && <p className="mt-2 text-xs text-muted-foreground">За этот период соцсеть не хранит цифры по дням: просмотры показаны по дате публикации.</p>}
        </Card>
        <Card className="flex flex-col gap-4">
          <div>
            <div className="text-[13px] text-muted-foreground">Подписчики · {data.handle}</div>
            <div className="font-[family-name:var(--font-manrope)] text-4xl leading-[44px] font-bold tracking-[-0.04em] tabular-nums">{nf(data.followers)}</div>
          </div>
          {known.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs font-semibold tabular-nums">
              <span className="rounded-full bg-positive/12 px-2.5 py-0.5 text-positive">+{nf(up)} пришли</span>
              <span className="rounded-full bg-negative/12 px-2.5 py-0.5 text-negative">−{nf(down)} ушли</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-[13px]">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <b className="tabular-nums">{value}</b>
              </div>
            ))}
            {!facts.length && <span className="text-muted-foreground">Подписки, отписки и действия в профиле соцсеть за этот период не отдала.</span>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Охват" value={nf(reach)} hint="сумма по дням">
          <Delta now={reach} before={data.prev.reach} />
        </Kpi>
        <Kpi label="Вовлечённость" value={pf(er)} hint="реакции / просмотры публикаций">
          <Delta now={er} before={prevEr} points />
        </Kpi>
        <Kpi label="Сохранения" value={nf(saves)} hint={perPost(saves)}>
          <Delta now={saves} before={data.prev.saves} />
        </Kpi>
        <Kpi label="Репосты" value={nf(shares)} hint={perPost(shares)}>
          <Delta now={shares} before={data.prev.shares} />
        </Kpi>
      </div>

      <FollowsChart data={data} />
    </>
  );
}

const TYPE_LABEL: Record<string, string> = { REEL: "Рилс", REELS: "Рилс", POST: "Публикации", FEED: "Публикации", CAROUSEL_CONTAINER: "Карусели", STORY: "Сторис", AD: "Реклама", LIVE: "Эфиры", IGTV: "Видео" };

const SORTS: { id: string; label: string; value: (p: Post) => number; format: (v: number) => string; why: string }[] = [
  { id: "views", label: "Просмотры", value: (p) => p.views, format: nf, why: "набрали больше всего просмотров" },
  { id: "er", label: "Вовлечённость", value: (p) => (p.views ? (interactions(p) / p.views) * 100 : 0), format: pf, why: "получили больше всего реакций на один просмотр: лайки, комментарии, репосты и сохранения" },
  { id: "saves", label: "Сохранения", value: (p) => p.saves, format: nf, why: "чаще всего сохраняли — признак полезного контента" },
  { id: "shares", label: "Репосты", value: (p) => p.shares, format: nf, why: "чаще всего пересылали — это даёт новый охват" },
  { id: "comments", label: "Комментарии", value: (p) => p.comments, format: nf, why: "вызвали больше всего обсуждения" },
];

function Content({ data }: { data: SmmAnalyticsData }) {
  const [sortId, setSortId] = useState("views");
  const posts = data.posts;
  if (!posts.length) return <Card><p className="text-sm text-muted-foreground">За этот период публикаций нет.</p></Card>;

  const formats = [...new Set(posts.map((p) => p.kind))]
    .map((kind) => {
      const list = posts.filter((p) => p.kind === kind);
      const views = sumOf(list, (p) => p.views);
      return { kind, count: list.length, views: views / list.length, er: views ? (sumOf(list, interactions) / views) * 100 : 0, saves: sumOf(list, (p) => p.saves) / list.length, shares: sumOf(list, (p) => p.shares) / list.length };
    })
    .sort((a, b) => b.views - a.views);
  const maxViews = Math.max(...formats.map((f) => f.views), 1);
  const maxEr = Math.max(...formats.map((f) => f.er), 0.0001);

  const byType = Object.entries(data.byType ?? {}).sort((a, b) => b[1] - a[1]);
  const typeTotal = sumOf(byType, (t) => t[1]);
  const inter = [
    { label: "Лайки", value: sumOf(posts, (p) => p.likes) },
    { label: "Сохранения", value: sumOf(posts, (p) => p.saves) },
    { label: "Репосты", value: sumOf(posts, (p) => p.shares) },
    { label: "Комментарии", value: sumOf(posts, (p) => p.comments) },
  ].sort((a, b) => b.value - a.value);

  const sort = SORTS.find((s) => s.id === sortId) ?? SORTS[0];
  const average = sumOf(posts, sort.value) / posts.length;
  const top = [...posts].sort((a, b) => sort.value(b) - sort.value(a)).slice(0, 5);

  return (
    <>
      <Card className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="section-title">Какой формат работает</h2>
          <span className="text-xs text-muted-foreground">в среднем на одну публикацию за период</span>
        </div>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {formats.map((f) => (
            <div key={f.kind} className="flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-border px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[15px]">{f.kind}</b>
                <span className="text-xs text-muted-foreground">{f.count} публ.</span>
                <span className="flex-1" />
                {formats.length > 1 && f.views === maxViews && <span className="rounded-full bg-cta px-2 py-0.5 text-[11px] font-semibold text-cta-foreground">больше просмотров</span>}
                {formats.length > 1 && f.er === maxEr && <span className="rounded-full bg-cta px-2 py-0.5 text-[11px] font-semibold text-cta-foreground">сильнее вовлекает</span>}
              </div>
              <Line label={<span className="text-muted-foreground">Просмотры</span>} value={nf(f.views)} share={(f.views / maxViews) * 100} />
              <Line label={<span className="text-muted-foreground">Вовлечённость</span>} value={pf(f.er)} share={(f.er / maxEr) * 100} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>сохранений {nf(f.saves)}</span>
                <span>репостов {nf(f.shares)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {byType.length > 0 && (
          <Card className="min-w-0">
            <h2 className="section-title">Просмотры по типу контента</h2>
            <div className="mt-4 flex flex-col gap-3">
              {byType.map(([type, value]) => (
                <Line key={type} label={TYPE_LABEL[type] ?? "Другое"} value={`${Math.round((value / Math.max(1, typeTotal)) * 100)} % · ${nf(value)}`} share={(value / Math.max(1, byType[0][1])) * 100} />
              ))}
            </div>
          </Card>
        )}
        <Card className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="section-title">Взаимодействия</h2>
            <span className="text-xs text-muted-foreground">всего {nf(sumOf(inter, (i) => i.value))} под публикациями периода</span>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {inter.map((i) => (
              <Line key={i.label} label={i.label} value={nf(i.value)} share={(i.value / Math.max(1, inter[0].value)) * 100} />
            ))}
          </div>
        </Card>
      </div>

      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section-title">Лучшие публикации</h2>
          <span className="flex-1" />
          <div role="group" aria-label="По какому показателю выбирать лучшие" className="flex flex-wrap gap-1.5">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === sort.id}
                onClick={() => setSortId(s.id)}
                className={cn("rounded-full border px-3.5 py-1.5 text-[13px] transition-colors", s.id === sort.id ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-muted")}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 mb-4 text-xs text-muted-foreground">
          Сейчас в топе публикации, которые {sort.why}. Множитель показывает, во сколько раз публикация сильнее средней за период ({sort.format(average)}).
        </p>
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
          {top.map((p, i) => {
            const times = average ? sort.value(p) / average : 0;
            const body = (
              <>
                <div className="relative aspect-[4/5] overflow-hidden rounded-[18px] bg-gradient-to-br from-[#2b4357] to-[#12283a]">
                  {p.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- the network's own short-lived preview address
                    <img src={p.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute top-2.5 left-2.5 rounded-full bg-cta px-2 py-0.5 text-[11px] font-bold text-cta-foreground">№{i + 1}</span>
                  <span className="absolute top-2.5 right-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">{p.kind}</span>
                  <span className="absolute bottom-9 left-3 text-[11px] text-white/80">{sort.label}</span>
                  <span className="absolute bottom-2 left-3 font-[family-name:var(--font-manrope)] text-[22px] font-bold tracking-[-0.03em] text-white tabular-nums">{sort.format(sort.value(p))}</span>
                </div>
                <div>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", times >= 1 ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative")}>
                    ×{times.toFixed(1).replace(".", ",")} к среднему
                  </span>
                </div>
                <p className="line-clamp-2 text-[13px] font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {dayLabel(p.date)} · {nf(p.views)} просм. · {nf(p.likes)} лайк. · {nf(p.saves)} сохр.
                </p>
              </>
            );
            return p.permalink ? (
              <a key={p.id} href={p.permalink} target="_blank" rel="noreferrer" className="flex min-w-0 flex-col gap-2">
                {body}
              </a>
            ) : (
              <article key={p.id} className="flex min-w-0 flex-col gap-2">
                {body}
              </article>
            );
          })}
        </div>
      </Card>
    </>
  );
}

const share = (group: Record<string, number> | undefined) => {
  const rows = Object.entries(group ?? {}).sort((a, b) => b[1] - a[1]);
  const total = sumOf(rows, (r) => r[1]);
  return { rows, total, max: rows[0]?.[1] ?? 1 };
};

function Audience({ data }: { data: SmmAnalyticsData }) {
  const follower = data.byFollower ?? {};
  const mine = follower.FOLLOWER ?? 0;
  const others = follower.NON_FOLLOWER ?? 0;
  const age = share(data.audience?.age);
  age.rows.sort((a, b) => a[0].localeCompare(b[0]));
  const gender = share(data.audience?.gender);
  const city = share(data.audience?.city);
  const GENDER: Record<string, string> = { F: "Женщины", M: "Мужчины", U: "Не указан" };
  const empty = !(mine + others) && !age.total && !gender.total && !city.total;

  if (empty)
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          {data.network === "facebook"
            ? "Данные об аудитории пока загружаются только для Instagram."
            : "Соцсеть ещё не отдала данные об аудитории. Они появятся после следующего обновления; Meta показывает их аккаунтам от 100 подписчиков."}
        </p>
      </Card>
    );

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        {mine + others > 0 && (
          <Card className="min-w-0">
            <h2 className="section-title">Кто смотрит</h2>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex h-3.5 overflow-hidden rounded-full bg-track">
                <div className="h-full bg-accent" style={{ width: `${(mine / (mine + others)) * 100}%` }} />
              </div>
              <div className="flex justify-between text-[13px]"><span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-accent align-[-1px]" />Подписчики</span><b className="tabular-nums">{Math.round((mine / (mine + others)) * 100)} % · {nf(mine)}</b></div>
              <div className="flex justify-between text-[13px]"><span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-track align-[-1px]" />Не подписчики</span><b className="tabular-nums">{Math.round((others / (mine + others)) * 100)} % · {nf(others)}</b></div>
              <p className="text-xs text-muted-foreground">Доля не подписчиков показывает, насколько контент выходит за пределы своей аудитории.</p>
            </div>
          </Card>
        )}
        {gender.total > 0 && (
          <Card className="min-w-0">
            <h2 className="section-title">Пол</h2>
            <div className="mt-4 flex flex-col gap-3">
              {gender.rows.map(([key, value]) => (
                <Line key={key} label={GENDER[key] ?? key} value={`${Math.round((value / gender.total) * 100)} %`} share={(value / gender.max) * 100} />
              ))}
            </div>
          </Card>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {age.total > 0 && (
          <Card className="min-w-0">
            <h2 className="section-title">Возраст</h2>
            <div className="mt-4 flex flex-col gap-3">
              {age.rows.map(([key, value]) => (
                <Line key={key} label={key.replace("-", "–")} value={`${Math.round((value / age.total) * 100)} %`} share={(value / Math.max(...age.rows.map((r) => r[1]))) * 100} />
              ))}
            </div>
          </Card>
        )}
        {city.total > 0 && (
          <Card className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="section-title">Города</h2>
              <span className="text-xs text-muted-foreground">доля от подписчиков</span>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {city.rows.slice(0, 6).map(([key, value]) => (
                <Line key={key} label={key} value={`${Math.round((value / Math.max(1, data.followers || city.total)) * 100)} %`} share={(value / city.max) * 100} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

/* ---------- Messages: funnel steps reported by ManyChat ---------- */

const HOURS = ["0", "3", "6", "9", "12", "15", "18", "21"];
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function Messages({ data }: { data: SmmAnalyticsData }) {
  const m = data.messages;
  if (!m.connected)
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="section-title">ManyChat ещё не подключён</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Здесь будут воронки по кодовым словам: сколько человек написали слово, сколько стали лидом, когда пишут и после какого контента. Адрес и
          инструкция для автоматизаций — во «Вводных», блок «ManyChat: воронки в сообщениях».
        </p>
      </Card>
    );
  const started = sumOf(m.funnels, (f) => f.start);
  const leads = sumOf(m.funnels, (f) => f.lead);
  if (!started && !leads)
    return (
      <Card>
        <p className="text-sm text-muted-foreground">За этот период событий из ManyChat не было.</p>
      </Card>
    );

  const views = sumOf(data.days, (d) => d.views);
  const most = Math.max(...m.funnels.map((f) => f.start), 1);
  const conv = (f: (typeof m.funnels)[number]) => (f.start ? f.lead / f.start : 0);
  const bestConv = Math.max(...m.funnels.map(conv));
  const hasContact = m.funnels.some((f) => f.contact > 0);
  const heatMax = Math.max(...m.heat.flat(), 1);
  let peak = { v: 0, d: 0, h: 0 };
  m.heat.forEach((row, d) => row.forEach((v, h) => v > peak.v && (peak = { v, d, h })));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Запусков воронок" value={nf(started)} hint="человек написали кодовое слово" />
        <Kpi label="Лидов передано" value={nf(leads)} hint="дошли до передачи в CRM" />
        <Kpi label="Конверсия в лид" value={started ? pf((leads / started) * 100) : "—"} hint="лиды / запуски" />
        <Kpi label="Запусков на 1000 просмотров" value={views ? ((started / views) * 1000).toFixed(1).replace(".", ",") : "—"} hint="насколько контент побуждает писать" />
      </div>

      <Card className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="section-title">Воронки по кодовым словам</h2>
          <span className="text-xs text-muted-foreground">написали слово → {hasContact ? "оставили контакт → " : ""}лид</span>
        </div>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {m.funnels.map((f) => (
            <div key={f.keyword} className="flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-border px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[15px] [overflow-wrap:anywhere]">{f.keyword}</b>
                <span className="flex-1" />
                {m.funnels.length > 1 && f.start === most && <span className="rounded-full bg-cta px-2 py-0.5 text-[11px] font-semibold text-cta-foreground">пишут чаще всего</span>}
                {m.funnels.length > 1 && bestConv > 0 && conv(f) === bestConv && <span className="rounded-full bg-cta px-2 py-0.5 text-[11px] font-semibold text-cta-foreground">лучшая конверсия</span>}
              </div>
              <Line label={<span className="text-muted-foreground">Написали слово</span>} value={nf(f.start)} share={(f.start / most) * 100} />
              {hasContact && (
                <Line
                  label={<span className="text-muted-foreground">Оставили контакт</span>}
                  value={`${nf(f.contact)}${f.start ? ` · ${Math.round((f.contact / f.start) * 100)} %` : ""}`}
                  share={(f.contact / most) * 100}
                  color="var(--muted-foreground)"
                />
              )}
              <Line label={<span className="text-muted-foreground">Лид</span>} value={`${nf(f.lead)}${f.start ? ` · ${Math.round(conv(f) * 100)} %` : ""}`} share={(f.lead / most) * 100} color="var(--positive)" />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <h2 className="section-title">После какого контента пишут</h2>
          <p className="mt-1.5 mb-3.5 text-xs text-muted-foreground">
            Запуски воронок в первые 48 часов после публикации. ManyChat не сообщает, под каким постом написали, поэтому запуск относится к ближайшей
            публикации — сначала к той, где названо это слово.
          </p>
          <div className="flex flex-col gap-3">
            {m.posts.map((p) => (
              <Line
                key={p.id}
                label={
                  <span className="block">
                    <span className="line-clamp-1">{p.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.kind} · {dayLabel(p.date)}
                    </span>
                  </span>
                }
                value={nf(p.count)}
                share={(p.count / Math.max(1, m.posts[0].count)) * 100}
              />
            ))}
            {!m.posts.length && <span className="text-sm text-muted-foreground">Запусков рядом с публикациями периода не было.</span>}
          </div>
        </Card>
        <Card className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="section-title">Когда пишут</h2>
            <span className="text-xs text-muted-foreground">запуски воронок, время по Варшаве</span>
          </div>
          <div className="mt-4 grid grid-cols-[28px_repeat(8,minmax(0,1fr))] items-center gap-1 text-[11px] text-muted-foreground">
            <span />
            {HOURS.map((h) => (
              <span key={h} className="text-center">
                {h}
              </span>
            ))}
            {m.heat.map((row, d) => [
              <span key={`d${d}`}>{WEEK[d]}</span>,
              ...row.map((v, h) => (
                <i key={`${d}-${h}`} title={`${WEEK[d]}, ${HOURS[h]}:00–${Number(HOURS[h]) + 3}:00 — ${nf(v)}`} className="block h-[22px] rounded-md bg-accent" style={{ opacity: v ? 0.15 + (v / heatMax) * 0.75 : 0.06 }} />
              )),
            ])}
          </div>
          {peak.v > 0 && (
            <p className="mt-2.5 text-xs text-muted-foreground">
              Чаще всего пишут: {WEEK[peak.d]}, {HOURS[peak.h]}:00–{Number(HOURS[peak.h]) + 3}:00. В это время важно быстро отвечать и стоит выпускать посты с кодовым словом.
            </p>
          )}
        </Card>
      </div>

      {m.texts.length > 0 && (
        <Card className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="section-title">Что пишут</h2>
            <span className="text-xs text-muted-foreground">последнее сообщение перед запуском, когда это не само кодовое слово</span>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {m.texts.map((t) => (
              <Line key={t.text} label={<span className="line-clamp-1">{t.text}</span>} value={nf(t.count)} share={(t.count / m.texts[0].count) * 100} color="var(--muted-foreground)" />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

export function SmmAnalytics({ data }: { data: SmmAnalyticsData }) {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Seg value={tab} onChange={setTab} items={TABS} label="Раздел аналитики" />
      </div>
      {tab === "overview" && <Overview data={data} />}
      {tab === "content" && <Content data={data} />}
      {tab === "audience" && <Audience data={data} />}
      {tab === "messages" && <Messages data={data} />}
    </div>
  );
}
