import { cn } from "@/lib/cn";
import type { Mood } from "@/lib/team/mood";
import { groundLevel, resolveTotem, type TaskGround, type TotemChoice, type TotemKind } from "@/lib/team/totem-kinds";

/**
 * A person's totem creature, drawn in SVG. Kind and colour are the person's pick (or follow the email);
 * how bright it is, its face and its motion follow the mood.
 */

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
const TOPS = [58, 48, 74, 56];
/** Where ears sit, from the middle. */
const EAR_X = [40, 32, 46, 38];
/** Half-width of the body at arm height. */
const SIDE_X = [56, 48, 66, 54];

const OUTLINE = "#17191c";
const CX = 100;
const line = { stroke: OUTLINE, strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function TotemCreature({
  seed,
  choice,
  mood,
  ground,
  className,
  size = 160,
}: {
  seed: string;
  choice?: TotemChoice | null;
  mood: Mood;
  /** Open tasks: grass grows as deadlines near; overdue ones overgrow and tie the creature up. Not given = a plain shadow. */
  ground?: TaskGround | null;
  className?: string;
  size?: number;
}) {
  const { kind, color } = resolveTotem(seed, choice);
  const { s, l } = TONE[mood];
  const hue = color.hue;
  const fill = `hsl(${hue} ${s}% ${l}%)`;
  const shade = `hsl(${hue} ${Math.max(s - 8, 0)}% ${l - 14}%)`;
  const belly = `hsl(${hue} ${Math.max(s - 20, 0)}% ${Math.min(l + 18, 92)}%)`;
  const top = TOPS[kind.body];
  const eyeY = top + (kind.body === 2 ? 40 : 46);
  const sadish = mood === "sad" || mood === "exhausted";
  const happyish = mood === "fire" || mood === "happy";

  const eyes =
    kind.eyes === "one"
      ? [{ x: CX, y: eyeY + 2, r: 17 }]
      : kind.eyes === "frog"
        ? [
            { x: CX - 30, y: top + 2, r: 12 },
            { x: CX + 30, y: top + 2, r: 12 },
          ]
        : [
            { x: CX - 22, y: eyeY, r: kind.head === "owl" ? 14 : 11 },
            { x: CX + 22, y: eyeY, r: kind.head === "owl" ? 14 : 11 },
          ];
  const mouthY = kind.eyes === "frog" ? top + 40 : kind.eyes === "one" ? eyeY + 32 : eyeY + 24;
  const cheekY = kind.eyes === "frog" ? top + 34 : eyeY + 16;
  const side = SIDE_X[kind.body];

  return (
    <svg viewBox="0 0 200 236" width={size} height={size * 1.18} className={cn("overflow-visible", className)} aria-hidden>
      {ground !== undefined ? (
        <>
          <Plateau />
          <Grass level={groundLevel(ground)} row="back" />
        </>
      ) : (
        <ellipse cx={100} cy={204} rx={54} ry={8} fill="currentColor" opacity={0.12} />
      )}

      <g className={cn("totem-motion", MOTION[mood])}>
        {kind.tail && (
          <path d={`M${CX + 40} 172 q44 6 50 -26 q2 -10 -6 -14 l14 -4 l-4 14 q-4 -6 -8 -2 q-6 30 -44 40z`} fill={shade} {...line} />
        )}
        {kind.spikes && (
          <g fill={shade} {...line}>
            <path d={`M${CX - 22} ${top + 6} l8 -20 l10 16z`} />
            <path d={`M${CX - 6} ${top + 2} l8 -22 l10 18z`} />
            <path d={`M${CX + 12} ${top + 4} l8 -20 l8 18z`} />
          </g>
        )}

        <Head kind={kind} top={top} earX={EAR_X[kind.body]} fill={fill} shade={shade} sadish={sadish} mood={mood} />

        <Arms kind={kind} side={side} fill={fill} mood={mood} sadish={sadish} />

        {kind.bottom === "feet" && (
          <g fill={shade} {...line}>
            <ellipse cx={CX - 24} cy={192} rx={15} ry={9} />
            <ellipse cx={CX + 24} cy={192} rx={15} ry={9} />
          </g>
        )}
        {kind.bottom === "tentacles" && (
          <g fill={fill} {...line}>
            {[-42, -15, 15, 42].map((dx, i) => (
              <path key={dx} d={`M${CX + dx - 9} 176 q${i % 2 ? 6 : -6} 18 ${i % 2 ? 2 : -10} 26 q8 2 14 -6 q-4 -10 4 -20z`} />
            ))}
          </g>
        )}

        {/* Body */}
        <path d={BODIES[kind.body]} fill={fill} {...line} />
        <ellipse cx={CX} cy={150} rx={kind.body === 2 ? 40 : 30} ry={26} fill={belly} opacity={0.85} />
        <path d={`M${CX - 30} ${top + 32} q6 -11 16 -15`} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={5} strokeLinecap="round" />

        {kind.eyes === "frog" && (
          // Eye bumps on top of the head
          <g fill={fill} {...line}>
            <circle cx={CX - 30} cy={top + 2} r={17} />
            <circle cx={CX + 30} cy={top + 2} r={17} />
          </g>
        )}

        {happyish && (
          <g fill="#ff7a9a" opacity={0.55}>
            <ellipse cx={CX - 40} cy={cheekY} rx={8} ry={5} />
            <ellipse cx={CX + 40} cy={cheekY} rx={8} ry={5} />
          </g>
        )}

        <Eyes mood={mood} eyes={eyes} />
        {kind.head === "owl" ? (
          <path d={`M${CX - 7} ${eyeY + 12} l7 ${mood === "fire" ? 14 : 10} l7 ${mood === "fire" ? -14 : -10}z`} fill="#ffb547" {...line} strokeWidth={3} />
        ) : (
          <Mouth mood={mood} y={mouthY} wide={kind.eyes === "frog"} />
        )}

        {mood === "ok" && (
          <path className="totem-sweat" d={`M${CX + 46} ${eyeY - 20} q7 10 0 14 q-7 -4 0 -14z`} fill="#8fd3ff" stroke={OUTLINE} strokeWidth={2.5} />
        )}
        {sadish && (
          <g fill="#7cc8ff" stroke={OUTLINE} strokeWidth={2.5}>
            <path className="totem-tear" d={`M${eyes[0].x} ${eyes[0].y + eyes[0].r - 1} q6 9 0 13 q-6 -4 0 -13z`} />
            {mood === "exhausted" && eyes[1] && (
              <path className="totem-tear totem-tear-late" d={`M${eyes[1].x} ${eyes[1].y + eyes[1].r - 1} q6 9 0 13 q-6 -4 0 -13z`} />
            )}
          </g>
        )}

        {ground && ground.overdue > 0 && <Ropes count={Math.min(ground.overdue, 3)} side={side} />}
      </g>

      {ground !== undefined && <Grass level={groundLevel(ground)} row="front" />}
      {ground && ground.overdue > 0 && <Vines count={Math.min(ground.overdue, 3)} side={side} />}

      {mood === "fire" && (
        <g fill="#d7ff3a" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round">
          <Sparkle className="totem-sparkle" x={30} y={58} r={10} />
          <Sparkle className="totem-sparkle totem-sparkle-2" x={174} y={36} r={8} />
          <Sparkle className="totem-sparkle totem-sparkle-3" x={24} y={128} r={6} />
        </g>
      )}
      {mood === "happy" && (
        <g fill="#d7ff3a" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round">
          <Sparkle className="totem-sparkle" x={166} y={48} r={7} />
        </g>
      )}
      {mood === "idle" && (
        <g className="totem-zzz" fill="currentColor" fontWeight={800} fontFamily="var(--font-manrope), sans-serif" opacity={0.55}>
          <text x={150} y={52} fontSize={18}>z</text>
          <text x={162} y={36} fontSize={14}>z</text>
        </g>
      )}
      {mood === "exhausted" && (
        <path className="totem-cloud" d="M60 30 q-10 -16 6 -20 q4 -14 20 -8 q12 -8 20 4 q16 -2 12 14 q8 12 -8 14 h-44 q-14 -2 -6 -4z" fill="#9aa0a6" opacity={0.6} />
      )}
    </svg>
  );
}

function Head({
  kind,
  top,
  earX,
  fill,
  shade,
  sadish,
  mood,
}: {
  kind: TotemKind;
  top: number;
  earX: number;
  fill: string;
  shade: string;
  sadish: boolean;
  mood: Mood;
}) {
  switch (kind.head) {
    case "cat":
      return (
        <g fill={fill} {...line}>
          <path d={`M${CX - earX} ${top + 22} L${CX - earX - 6} ${top - 14} L${CX - 14} ${top + 4} Z`} />
          <path d={`M${CX + earX} ${top + 22} L${CX + earX + 6} ${top - 14} L${CX + 14} ${top + 4} Z`} />
        </g>
      );
    case "horns":
      return (
        <g fill="#f5efe1" {...line}>
          <path d={`M${CX - 28} ${top + 6} q-14 -22 -4 -34 q6 18 18 28 z`} />
          <path d={`M${CX + 28} ${top + 6} q14 -22 4 -34 q-6 18 -18 28 z`} />
        </g>
      );
    case "antenna":
      return (
        <g {...line}>
          <path d={`M${CX - 12} ${top + 4} q-4 -20 -16 -30`} fill="none" />
          <path d={`M${CX + 12} ${top + 4} q4 -20 16 -30`} fill="none" />
          <circle cx={CX - 28} cy={top - 28} r={7} fill={mood === "fire" ? "#d7ff3a" : fill} />
          <circle cx={CX + 28} cy={top - 28} r={7} fill={mood === "fire" ? "#d7ff3a" : fill} />
        </g>
      );
    case "bunny":
      return sadish ? (
        <g fill={fill} {...line}>
          <ellipse cx={CX - earX - 2} cy={top + 18} rx={10} ry={28} transform={`rotate(58 ${CX - earX - 2} ${top + 18})`} />
          <ellipse cx={CX + earX + 2} cy={top + 18} rx={10} ry={28} transform={`rotate(-58 ${CX + earX + 2} ${top + 18})`} />
        </g>
      ) : (
        <g fill={fill} {...line}>
          <ellipse cx={CX - 22} cy={top - 18} rx={11} ry={30} transform={`rotate(-14 ${CX - 22} ${top - 18})`} />
          <ellipse cx={CX + 22} cy={top - 18} rx={11} ry={30} transform={`rotate(14 ${CX + 22} ${top - 18})`} />
        </g>
      );
    case "sprout":
      return (
        <g {...line}>
          <path d={`M${CX} ${top + 2} q-2 -14 2 -22`} fill="none" />
          <path d={`M${CX + 2} ${top - 18} q-24 -10 -30 6 q18 8 30 -6z`} fill={sadish ? "#a8b5a0" : "#7ed957"} />
          <path d={`M${CX + 2} ${top - 18} q20 -18 32 -4 q-16 14 -32 4z`} fill={sadish ? "#a8b5a0" : "#7ed957"} />
        </g>
      );
    case "bear":
      return (
        <g {...line}>
          <circle cx={CX - earX} cy={top + 4} r={16} fill={fill} />
          <circle cx={CX + earX} cy={top + 4} r={16} fill={fill} />
          <circle cx={CX - earX} cy={top + 6} r={7} fill={shade} stroke="none" />
          <circle cx={CX + earX} cy={top + 6} r={7} fill={shade} stroke="none" />
        </g>
      );
    case "owl":
      return (
        <g fill={shade} {...line}>
          <path d={`M${CX - 30} ${top + 10} l-14 -24 l26 12z`} />
          <path d={`M${CX + 30} ${top + 10} l14 -24 l-26 12z`} />
        </g>
      );
    case "unicorn":
      return (
        <g {...line}>
          <path d={`M${CX - 6} ${top + 2} l6 -34 l6 34z`} fill="#ffd66b" />
          <path d={`M${CX - 4} ${top - 8} l8 -3 M${CX - 3} ${top - 18} l6 -2`} fill="none" strokeWidth={2.5} />
          <path d={`M${CX + 10} ${top + 4} q16 -14 28 -2 q-10 2 -10 12 q-8 -8 -18 -10z`} fill="#ff9ad5" />
        </g>
      );
    default:
      return null;
  }
}

function Arms({ kind, side, fill, mood, sadish }: { kind: TotemKind; side: number; fill: string; mood: Mood; sadish: boolean }) {
  if (kind.arms === "wings") {
    const lift = mood === "fire" ? -18 : sadish ? 10 : 0;
    return (
      <g fill={fill} {...line}>
        <ellipse cx={CX - side - 8} cy={136 + lift / 2} rx={13} ry={28} transform={`rotate(${28 - lift} ${CX - side - 8} ${136 + lift / 2})`} />
        <ellipse cx={CX + side + 8} cy={136 + lift / 2} rx={13} ry={28} transform={`rotate(${-28 + lift} ${CX + side + 8} ${136 + lift / 2})`} />
      </g>
    );
  }
  const arm = (d: string) => (
    <>
      <path d={d} fill="none" strokeWidth={9} stroke={OUTLINE} strokeLinecap="round" />
      <path d={d} fill="none" strokeWidth={5} stroke={fill} strokeLinecap="round" />
    </>
  );
  const drop = sadish ? 22 : 6;
  const reach = sadish ? 34 : 24;
  return (
    <g>
      {arm(`M${CX - side + 2} 132 q-22 ${drop} -16 ${reach}`)}
      {mood === "fire" ? (
        <g className="totem-wave">
          {arm(`M${CX + side - 2} 128 q22 -10 24 -36`)}
          <g fill={fill} {...line}>
            <rect x={CX + side + 12} y={78} width={20} height={18} rx={6} />
            <rect x={CX + side + 16} y={64} width={8} height={18} rx={4} />
          </g>
        </g>
      ) : (
        arm(`M${CX + side - 2} 132 q22 ${drop} 16 ${reach}`)
      )}
    </g>
  );
}

/** A soft grassy knoll under the creature: wide, uneven edge, no rim. */
function Plateau() {
  return (
    <g>
      <ellipse cx={100} cy={216} rx={92} ry={9} fill="currentColor" opacity={0.08} />
      <path
        d="M6 212 q10 -12 32 -14 q18 -8 40 -6 q22 -7 44 -2 q24 -4 42 4 q22 4 30 16 q-4 8 -24 10 q-80 8 -158 0 q-12 -2 -6 -8z"
        fill="#6fbb4b"
      />
      <path d="M10 214 q86 10 180 0 q-2 6 -20 8 q-70 7 -142 0 q-16 -2 -18 -8z" fill="#5aa63c" />
      <g fill="#8fd16a" opacity={0.7}>
        <ellipse cx={46} cy={204} rx={14} ry={3} />
        <ellipse cx={150} cy={206} rx={16} ry={3} />
      </g>
    </g>
  );
}

/** Height of the grass per ground level; overdue grass is twice as tall and darker. */
const GRASS_HEIGHT = [5, 9, 16, 24, 38];

function Grass({ level, row }: { level: 0 | 1 | 2 | 3 | 4; row: "back" | "front" }) {
  const base = GRASS_HEIGHT[level];
  const blades: { x: number; h: number; lean: number; tone: string }[] = [];
  // Back row stands along the far edge, front row along the near edge (it hides the feet when tall).
  const y = row === "back" ? 202 : 210;
  for (let i = 0; i < 30; i++) {
    const x = 16 + i * 5.8 + (row === "front" ? 3 : 0);
    const k = ((i * 37 + (row === "front" ? 11 : 0)) % 10) / 10;
    blades.push({
      x,
      h: base * (0.65 + k * 0.7) * (row === "front" ? 0.85 : 1),
      lean: (k - 0.5) * (level >= 3 ? 10 : 6),
      tone: level === 4 ? (i % 2 ? "#3f8f2f" : "#4f9f39") : i % 2 ? "#5fae3e" : "#7cc957",
    });
  }
  return (
    <g fill="none" strokeLinecap="round" className={level >= 2 ? "totem-grass" : undefined}>
      {blades.map((b) => (
        <path key={b.x} d={`M${b.x} ${y + ((b.x - 100) / 90) ** 2 * 8} q${b.lean * 0.4} ${-b.h * 0.55} ${b.lean} ${-b.h}`} stroke={b.tone} strokeWidth={level === 4 ? 4 : 3} />
      ))}
    </g>
  );
}

/** Overdue tasks: vines climb the creature from the ground. */
function Vines({ count, side }: { count: number; side: number }) {
  const vines = [
    `M${CX - side + 4} 204 q-14 -26 6 -44 q18 -16 2 -40`,
    `M${CX + side - 4} 204 q14 -26 -6 -44 q-18 -16 -2 -40`,
    `M${CX - 10} 206 q-24 -20 0 -36 q24 -14 6 -30`,
  ].slice(0, count + 1);
  return (
    <g fill="none" strokeLinecap="round">
      {vines.map((d, i) => (
        <g key={i}>
          <path d={d} stroke="#2f7a22" strokeWidth={5} />
          <path d={d} stroke="#5aa83f" strokeWidth={2.5} />
        </g>
      ))}
      <g fill="#5aa83f" stroke={OUTLINE} strokeWidth={2}>
        {[
          [CX - side + 2, 176],
          [CX - side + 14, 148],
          [CX + side - 2, 172],
          [CX + side - 14, 144],
          [CX - 14, 184],
        ]
          .slice(0, 2 + count)
          .map(([x, y]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={7} ry={4} transform={`rotate(-30 ${x} ${y})`} />
          ))}
      </g>
    </g>
  );
}

/** Overdue tasks: one rope per overdue task (up to three) ties the creature. */
function Ropes({ count, side }: { count: number; side: number }) {
  const rows = [152, 128, 174].slice(0, count);
  return (
    <g fill="none" strokeLinecap="round">
      {rows.map((y) => {
        const d = `M${CX - side - 8} ${y - 4} q${side + 8} 14 ${2 * (side + 8)} 0`;
        return (
          <g key={y}>
            <path d={d} stroke={OUTLINE} strokeWidth={10} />
            <path d={d} stroke="#c9924f" strokeWidth={6} />
            <path d={d} stroke="#8a5a2b" strokeWidth={6} strokeDasharray="2 6" />
            <circle cx={CX + 10} cy={y + 3} r={6} fill="#c9924f" stroke={OUTLINE} strokeWidth={2.5} />
            <path d={`M${CX + 14} ${y + 7} l8 10 M${CX + 8} ${y + 8} l2 12`} stroke="#c9924f" strokeWidth={4} />
          </g>
        );
      })}
    </g>
  );
}

function Sparkle({ x, y, r, className }: { x: number; y: number; r: number; className?: string }) {
  const k = r * 0.32;
  return <path className={className} d={`M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`} />;
}

function Eyes({ mood, eyes }: { mood: Mood; eyes: { x: number; y: number; r: number }[] }) {
  const stroke = { stroke: OUTLINE, strokeWidth: 4, strokeLinecap: "round" as const, fill: "none" };
  if (mood === "fire" || mood === "happy") {
    return (
      <g {...stroke}>
        {eyes.map((e) => (
          <path key={e.x} d={`M${e.x - e.r * 0.85} ${e.y + 3} q${e.r * 0.85} ${-e.r * 1.1} ${e.r * 1.7} 0`} />
        ))}
      </g>
    );
  }
  if (mood === "idle") {
    return (
      <g {...stroke}>
        {eyes.map((e) => (
          <path key={e.x} d={`M${e.x - e.r * 0.75} ${e.y} q${e.r * 0.75} ${e.r * 0.55} ${e.r * 1.5} 0`} />
        ))}
      </g>
    );
  }
  const sad = mood === "sad" || mood === "exhausted";
  return (
    <g>
      {eyes.map((e) => {
        const side = e.x < CX - 1 ? -1 : e.x > CX + 1 ? 1 : 0;
        const browY = e.y - e.r - 8;
        const brow =
          side === 0
            ? sad
              ? `M${e.x - 14} ${browY + 4} q14 -10 28 0`
              : `M${e.x - 12} ${browY} L${e.x + 12} ${browY - 2}`
            : sad
              ? `M${e.x - side * 12} ${browY - 1} L${e.x + side * 6} ${browY + 5}`
              : `M${e.x - 10} ${browY + 1} L${e.x + 10} ${browY - 1}`;
        return (
          <g key={e.x}>
            <ellipse cx={e.x} cy={e.y} rx={e.r} ry={e.r * 1.15} fill="#fff" stroke={OUTLINE} strokeWidth={3.5} />
            <circle cx={e.x - side} cy={e.y + (sad ? e.r * 0.35 : 1)} r={e.r * 0.5} fill={OUTLINE} />
            <circle cx={e.x + e.r * 0.2} cy={e.y - e.r * 0.2} r={e.r * 0.17} fill="#fff" />
            {sad && <path d={`M${e.x - e.r} ${e.y - 2} q${e.r} ${-e.r * 0.75} ${e.r * 2} 0`} fill="#bdbdbd" stroke={OUTLINE} strokeWidth={3} />}
            {/* Frogs' eyes sit on top of the head: no brows */}
            {e.y > 70 && <path d={brow} stroke={OUTLINE} strokeWidth={4} strokeLinecap="round" fill="none" />}
          </g>
        );
      })}
    </g>
  );
}

function Mouth({ mood, y, wide }: { mood: Mood; y: number; wide: boolean }) {
  const w = wide ? 1.5 : 1;
  switch (mood) {
    case "fire":
      return (
        <g {...line}>
          <path d={`M${CX - 16 * w} ${y - 2} q${16 * w} 22 ${32 * w} 0 z`} fill="#3b1220" />
          <path d={`M${CX - 7} ${y + 8} q7 -5 14 0`} fill="#ff6f8e" stroke="none" />
        </g>
      );
    case "happy":
      return <path d={`M${CX - 14 * w} ${y} q${14 * w} 14 ${28 * w} 0`} fill="none" {...line} />;
    case "ok":
      return <path d={`M${CX - 10 * w} ${y + 2} q${5 * w} -4 ${10 * w} 0 q${5 * w} 4 ${10 * w} 0`} fill="none" {...line} />;
    case "sad":
      return <path d={`M${CX - 12 * w} ${y + 6} q${12 * w} -10 ${24 * w} 0`} fill="none" {...line} />;
    case "exhausted":
      return <path d={`M${CX - 10} ${y + 6} q10 -8 20 0 q-10 6 -20 0z`} fill="#3b1220" {...line} />;
    case "idle":
      return <ellipse cx={CX} cy={y + 2} rx={5} ry={4} fill="#3b1220" {...line} />;
  }
}
