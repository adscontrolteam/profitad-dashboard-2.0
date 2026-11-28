import { cn } from "@/lib/cn";
import type { Mood } from "@/lib/team/mood";

/**
 * A person's totem creature, drawn in SVG. Its build (body, ears, colour) is fixed by the email,
 * so everyone keeps the same creature; its look and motion follow the mood.
 */

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HUES = [78, 168, 200, 262, 328, 26, 46, 145, 290, 8];

const TONE: Record<Mood, { s: number; l: number }> = {
  fire: { s: 88, l: 57 },
  happy: { s: 70, l: 60 },
  ok: { s: 42, l: 62 },
  sad: { s: 16, l: 66 },
  exhausted: { s: 5, l: 70 },
  idle: { s: 22, l: 64 },
};

const MOTION: Record<Mood, string> = {
  fire: "totem-bounce",
  happy: "totem-sway",
  ok: "totem-breathe",
  sad: "totem-droop",
  exhausted: "totem-droop",
  idle: "totem-breathe",
};

const BODIES = [
  // round bean
  "M100 58c38 0 62 30 62 70 0 38-26 62-62 62s-62-24-62-62c0-40 24-70 62-70z",
  // tall egg
  "M100 48c30 0 52 38 52 78 0 40-22 64-52 64s-52-24-52-64c0-40 22-78 52-78z",
  // wide mochi
  "M100 74c46 0 72 26 72 62 0 34-28 54-72 54s-72-20-72-54c0-36 26-62 72-62z",
  // little ghost with a wavy hem
  "M100 56c36 0 58 30 58 66v60c-8 8-16 8-24 0-8 8-17 8-25 0-8 8-17 8-25 0-8 8-16 8-24 0v-60c0-36 22-66 58-66z",
];

const OUTLINE = "#17191c";

export function TotemCreature({
  seed,
  mood,
  className,
  size = 160,
}: {
  seed: string;
  mood: Mood;
  className?: string;
  size?: number;
}) {
  const h = hash(seed);
  const body = h % BODIES.length;
  const head = (h >>> 3) % 5;
  const hue = HUES[(h >>> 7) % HUES.length];
  const eyeGap = 20 + ((h >>> 11) % 3) * 4;
  const { s, l } = TONE[mood];
  const fill = `hsl(${hue} ${s}% ${l}%)`;
  const shade = `hsl(${hue} ${Math.max(s - 8, 0)}% ${l - 14}%)`;
  const belly = `hsl(${hue} ${Math.max(s - 20, 0)}% ${Math.min(l + 18, 92)}%)`;
  const top = body === 2 ? 74 : body === 1 ? 48 : 58;
  const eyeY = top + (body === 2 ? 40 : 46);
  const cx = 100;
  const sadish = mood === "sad" || mood === "exhausted";
  const happyish = mood === "fire" || mood === "happy";
  const stroke = { stroke: OUTLINE, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg viewBox="0 0 200 220" width={size} height={size * 1.1} className={cn("overflow-visible", className)} aria-hidden>
      <ellipse cx={100} cy={204} rx={54} ry={8} fill="currentColor" opacity={0.12} />

      <g className={cn("totem-motion", MOTION[mood])}>
        {/* Head decoration: ears, horns, antenna, bunny ears or a tuft */}
        {head === 0 && (
          <g fill={fill} {...stroke}>
            <path d={`M${cx - 40} ${top + 22} L${cx - 46} ${top - 14} L${cx - 14} ${top + 4} Z`} />
            <path d={`M${cx + 40} ${top + 22} L${cx + 46} ${top - 14} L${cx + 14} ${top + 4} Z`} />
          </g>
        )}
        {head === 1 && (
          <g fill="#f5efe1" {...stroke}>
            <path d={`M${cx - 28} ${top + 6} q-14 -22 -4 -34 q6 18 18 28 z`} />
            <path d={`M${cx + 28} ${top + 6} q14 -22 4 -34 q-6 18 -18 28 z`} />
          </g>
        )}
        {head === 2 && (
          <g {...stroke}>
            <path d={`M${cx} ${top + 2} q6 -22 -6 -36`} fill="none" />
            <circle cx={cx - 6} cy={top - 38} r={8} fill={mood === "fire" ? "#d7ff3a" : fill} />
          </g>
        )}
        {head === 3 &&
          (sadish ? (
            // Ears hang down along the head when things are bad
            <g fill={fill} {...stroke}>
              <ellipse cx={cx - 40} cy={top + 18} rx={10} ry={28} transform={`rotate(58 ${cx - 40} ${top + 18})`} />
              <ellipse cx={cx + 40} cy={top + 18} rx={10} ry={28} transform={`rotate(-58 ${cx + 40} ${top + 18})`} />
            </g>
          ) : (
            <g fill={fill} {...stroke}>
              <ellipse cx={cx - 22} cy={top - 18} rx={11} ry={30} transform={`rotate(-14 ${cx - 22} ${top - 18})`} />
              <ellipse cx={cx + 22} cy={top - 18} rx={11} ry={30} transform={`rotate(14 ${cx + 22} ${top - 18})`} />
            </g>
          ))}
        {head === 4 && (
          <path d={`M${cx - 16} ${top + 6} q4 -26 14 -8 q6 -24 14 -2 q10 -18 8 10`} fill={shade} {...stroke} />
        )}

        {/* Arms: a thumbs-up when things go great */}
        <g fill={fill} {...stroke}>
          <path d={`M${cx - 54} 132 q-22 ${sadish ? 22 : 6} -16 ${sadish ? 34 : 24}`} fill="none" strokeWidth={9} stroke={OUTLINE} />
          <path d={`M${cx - 54} 132 q-22 ${sadish ? 22 : 6} -16 ${sadish ? 34 : 24}`} fill="none" strokeWidth={5} stroke={fill} />
          {mood === "fire" ? (
            <g className="totem-wave">
              <path d={`M${cx + 54} 128 q22 -10 24 -36`} fill="none" strokeWidth={9} stroke={OUTLINE} />
              <path d={`M${cx + 54} 128 q22 -10 24 -36`} fill="none" strokeWidth={5} stroke={fill} />
              <rect x={cx + 68} y={78} width={20} height={18} rx={6} />
              <rect x={cx + 72} y={64} width={8} height={18} rx={4} />
            </g>
          ) : (
            <>
              <path d={`M${cx + 54} 132 q22 ${sadish ? 22 : 6} 16 ${sadish ? 34 : 24}`} fill="none" strokeWidth={9} stroke={OUTLINE} />
              <path d={`M${cx + 54} 132 q22 ${sadish ? 22 : 6} 16 ${sadish ? 34 : 24}`} fill="none" strokeWidth={5} stroke={fill} />
            </>
          )}
        </g>

        {/* Feet */}
        <g fill={shade} {...stroke}>
          <ellipse cx={cx - 24} cy={192} rx={15} ry={9} />
          <ellipse cx={cx + 24} cy={192} rx={15} ry={9} />
        </g>

        {/* Body */}
        <path d={BODIES[body]} fill={fill} {...stroke} />
        <ellipse cx={cx} cy={150} rx={body === 2 ? 40 : 30} ry={26} fill={belly} opacity={0.85} />
        <path d={`M${cx - 38} ${top + 26} q8 -14 20 -18`} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={5} strokeLinecap="round" />

        {/* Cheeks */}
        {happyish && (
          <g fill="#ff7a9a" opacity={0.55}>
            <ellipse cx={cx - eyeGap - 14} cy={eyeY + 16} rx={8} ry={5} />
            <ellipse cx={cx + eyeGap + 14} cy={eyeY + 16} rx={8} ry={5} />
          </g>
        )}

        <Eyes mood={mood} cx={cx} y={eyeY} gap={eyeGap} />
        <Mouth mood={mood} cx={cx} y={eyeY + 24} />

        {/* Sweat drop when under strain */}
        {mood === "ok" && (
          <path className="totem-sweat" d={`M${cx + 46} ${eyeY - 20} q7 10 0 14 q-7 -4 0 -14z`} fill="#8fd3ff" stroke={OUTLINE} strokeWidth={2.5} />
        )}
        {/* Tears */}
        {sadish && (
          <g fill="#7cc8ff" stroke={OUTLINE} strokeWidth={2.5}>
            <path className="totem-tear" d={`M${cx - eyeGap} ${eyeY + 10} q6 9 0 13 q-6 -4 0 -13z`} />
            {mood === "exhausted" && (
              <path className="totem-tear totem-tear-late" d={`M${cx + eyeGap} ${eyeY + 10} q6 9 0 13 q-6 -4 0 -13z`} />
            )}
          </g>
        )}
      </g>

      {/* Mood effects outside the body's motion */}
      {mood === "fire" && (
        <g fill="#d7ff3a" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round">
          <Sparkle className="totem-sparkle" x={34} y={58} r={10} />
          <Sparkle className="totem-sparkle totem-sparkle-2" x={170} y={40} r={8} />
          <Sparkle className="totem-sparkle totem-sparkle-3" x={26} y={128} r={6} />
        </g>
      )}
      {mood === "happy" && (
        <g fill="#d7ff3a" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round">
          <Sparkle className="totem-sparkle" x={162} y={52} r={7} />
        </g>
      )}
      {mood === "idle" && (
        <g className="totem-zzz" fill="currentColor" fontWeight={800} fontFamily="var(--font-manrope), sans-serif" opacity={0.55}>
          <text x={148} y={56} fontSize={18}>z</text>
          <text x={160} y={40} fontSize={14}>z</text>
        </g>
      )}
      {mood === "exhausted" && (
        <path className="totem-cloud" d="M60 34 q-10 -16 6 -20 q4 -14 20 -8 q12 -8 20 4 q16 -2 12 14 q8 12 -8 14 h-44 q-14 -2 -6 -4z" fill="#9aa0a6" opacity={0.6} />
      )}
    </svg>
  );
}

function Sparkle({ x, y, r, className }: { x: number; y: number; r: number; className?: string }) {
  const k = r * 0.32;
  return <path className={className} d={`M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`} />;
}

function Eyes({ mood, cx, y, gap }: { mood: Mood; cx: number; y: number; gap: number }) {
  const stroke = { stroke: OUTLINE, strokeWidth: 4, strokeLinecap: "round" as const, fill: "none" };
  if (mood === "fire" || mood === "happy") {
    // Happy closed eyes: ^ ^
    return (
      <g {...stroke}>
        <path d={`M${cx - gap - 9} ${y + 3} q9 -12 18 0`} />
        <path d={`M${cx + gap - 9} ${y + 3} q9 -12 18 0`} />
      </g>
    );
  }
  if (mood === "idle") {
    return (
      <g {...stroke}>
        <path d={`M${cx - gap - 8} ${y} q8 6 16 0`} />
        <path d={`M${cx + gap - 8} ${y} q8 6 16 0`} />
      </g>
    );
  }
  const sad = mood === "sad" || mood === "exhausted";
  return (
    <g>
      {[-1, 1].map((side) => {
        const ex = cx + side * gap;
        return (
          <g key={side}>
            <ellipse cx={ex} cy={y} rx={11} ry={13} fill="#fff" stroke={OUTLINE} strokeWidth={3.5} />
            <circle cx={ex + side * -1} cy={y + (sad ? 4 : 1)} r={5.5} fill={OUTLINE} />
            <circle cx={ex + 2} cy={y - 2} r={1.8} fill="#fff" />
            {/* Heavy eyelids and worried brows when things are bad */}
            {sad ? (
              <path d={`M${ex - 11} ${y - 2} q11 -8 22 0`} fill="#bdbdbd" stroke={OUTLINE} strokeWidth={3} />
            ) : null}
            <path
              d={sad ? `M${ex - side * 12} ${y - 22} L${ex + side * 6} ${y - 16}` : `M${ex - 10} ${y - 20} L${ex + 10} ${y - 22}`}
              stroke={OUTLINE}
              strokeWidth={4}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </g>
  );
}

function Mouth({ mood, cx, y }: { mood: Mood; cx: number; y: number }) {
  const stroke = { stroke: OUTLINE, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (mood) {
    case "fire":
      return (
        <g {...stroke}>
          <path d={`M${cx - 16} ${y - 2} q16 22 32 0 z`} fill="#3b1220" />
          <path d={`M${cx - 7} ${y + 8} q7 -5 14 0`} fill="#ff6f8e" stroke="none" />
        </g>
      );
    case "happy":
      return <path d={`M${cx - 14} ${y} q14 14 28 0`} fill="none" {...stroke} />;
    case "ok":
      return <path d={`M${cx - 10} ${y + 2} q5 -4 10 0 q5 4 10 0`} fill="none" {...stroke} />;
    case "sad":
      return <path d={`M${cx - 12} ${y + 6} q12 -10 24 0`} fill="none" {...stroke} />;
    case "exhausted":
      return <path d={`M${cx - 10} ${y + 6} q10 -8 20 0 q-10 6 -20 0z`} fill="#3b1220" {...stroke} />;
    case "idle":
      return <ellipse cx={cx} cy={y + 2} rx={5} ry={4} fill="#3b1220" {...stroke} />;
  }
}
