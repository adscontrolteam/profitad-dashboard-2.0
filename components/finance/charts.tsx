import { money } from "@/lib/finance/currency";
import type { PnlMonth } from "@/lib/finance/report";
import { monthShort } from "./ui";

const W = 640;
const H = 240;
const PL = 44;
const PB = 26;
const PT = 22;

function axis(max: number, y: (v: number) => number) {
  const out = [];
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    out.push(
      <g key={i}>
        <line x1={PL} x2={W} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
        <text x={0} y={y(v) + 4} className="fill-muted-foreground text-[11px]">
          {v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)}
        </text>
      </g>,
    );
  }
  return out;
}

/** Revenue and expenses as bars, profit as a line. The current month is a forecast (lime bar). */
export function PnlChart({ data }: { data: PnlMonth[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.payroll + d.other))) * 1.15;
  const min = Math.min(0, ...data.map((d) => d.profit));
  const span = max - min;
  const y = (v: number) => H - PB - ((v - min) / span) * (H - PB - PT);
  const bw = (W - PL) / Math.max(data.length, 1);
  const points = data.map((d, i) => ({ x: PL + i * bw + bw / 2, y: y(d.profit), d }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Доход, расходы и прибыль по месяцам">
      {axis(max, y)}
      {data.map((d, i) => {
        const x = PL + i * bw + bw * 0.14;
        const w = bw * 0.34;
        const exp = d.payroll + d.other;
        return (
          <g key={d.month}>
            <rect x={x} y={y(d.revenue)} width={w} height={Math.max(0, y(0) - y(d.revenue))} rx={5} className={d.forecast ? "fill-cta" : "fill-foreground"}>
              <title>{`Доход ${money(d.revenue)}`}</title>
            </rect>
            <rect x={x + w + 2} y={y(exp)} width={w} height={Math.max(0, y(0) - y(exp))} rx={5} className="fill-muted-foreground opacity-40">
              <title>{`Расходы ${money(exp)}`}</title>
            </rect>
            <text x={x + w + 1} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {monthShort(d.month)}
            </text>
          </g>
        );
      })}
      <path d={points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")} className="fill-none stroke-positive" strokeWidth={2.5} />
      {points.map((p) => (
        <circle key={p.d.month} cx={p.x} cy={p.y} r={p.d.forecast ? 5 : 3.5} className="fill-card stroke-positive" strokeWidth={2}>
          <title>{`Прибыль ${money(p.d.profit)}`}</title>
        </circle>
      ))}
      {points.length > 0 && (
        <text x={points[points.length - 1].x} y={points[points.length - 1].y - 10} textAnchor="middle" className="fill-positive text-[11px] font-bold">
          {money(points[points.length - 1].d.profit)}
        </text>
      )}
    </svg>
  );
}

/** Fact bars against a dashed plan line, with % of plan above each bar. */
export function PlanFactChart({ data }: { data: { month: string; fact: number; plan: number | null; forecast: boolean }[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.fact, d.plan ?? 0))) * 1.18;
  const y = (v: number) => H - PB - (Math.max(v, 0) / max) * (H - PB - PT);
  const bw = (W - PL) / Math.max(data.length, 1);
  const planPts = data.map((d, i) => (d.plan === null ? null : { x: PL + i * bw + bw / 2, y: y(d.plan) }));
  let path = "";
  planPts.forEach((p, i) => {
    if (!p) return;
    path += `${path && planPts[i - 1] ? "L" : "M"}${p.x} ${p.y} `;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="План и факт по месяцам">
      {axis(max, y)}
      {data.map((d, i) => {
        const x = PL + i * bw + bw * 0.22;
        const w = bw * 0.56;
        const pct = d.plan ? Math.round((d.fact / d.plan) * 100) : null;
        return (
          <g key={d.month}>
            <rect x={x} y={y(d.fact)} width={w} height={Math.max(0, y(0) - y(d.fact))} rx={6} className={d.forecast ? "fill-cta" : "fill-foreground"} />
            {pct !== null && (
              <text
                x={x + w / 2}
                y={y(d.fact) - 6}
                textAnchor="middle"
                className={`text-[11px] font-bold ${pct >= 100 ? "fill-positive" : pct >= 90 ? "fill-warning" : "fill-negative"}`}
              >
                {pct}%
              </text>
            )}
            <text x={x + w / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {monthShort(d.month)}
            </text>
          </g>
        );
      })}
      {path && <path d={path} className="fill-none stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="4 4" />}
    </svg>
  );
}
