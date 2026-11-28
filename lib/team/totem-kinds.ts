/**
 * The totem catalogue: kinds of creatures and colours a person can pick in «Настройки».
 * Without a choice the kind and colour follow the email, so everyone still has a creature of their own.
 * Client-safe: used by the creature, the settings picker and the server.
 */

export type HeadKind = "cat" | "horns" | "antenna" | "bunny" | "sprout" | "bear" | "owl" | "frog" | "unicorn" | "none";

export interface TotemKind {
  id: string;
  label: string;
  /** Index in the creature's body shapes: 0 round, 1 tall egg, 2 wide, 3 ghost. */
  body: 0 | 1 | 2 | 3;
  head: HeadKind;
  eyes: "two" | "one" | "frog";
  bottom: "feet" | "tentacles" | "none";
  arms: "arms" | "wings";
  tail?: boolean;
  spikes?: boolean;
}

export const TOTEM_KINDS: TotemKind[] = [
  { id: "kitty", label: "Котик", body: 0, head: "cat", eyes: "two", bottom: "feet", arms: "arms" },
  { id: "bunny", label: "Зайка", body: 3, head: "bunny", eyes: "two", bottom: "feet", arms: "arms" },
  { id: "dragon", label: "Дракончик", body: 0, head: "horns", eyes: "two", bottom: "feet", arms: "arms", tail: true, spikes: true },
  { id: "alien", label: "Пришелец", body: 1, head: "antenna", eyes: "two", bottom: "feet", arms: "arms" },
  { id: "sprout", label: "Росток", body: 0, head: "sprout", eyes: "two", bottom: "feet", arms: "arms" },
  { id: "bear", label: "Мишка", body: 2, head: "bear", eyes: "two", bottom: "feet", arms: "arms" },
  { id: "owl", label: "Совёнок", body: 1, head: "owl", eyes: "two", bottom: "feet", arms: "wings" },
  { id: "frog", label: "Лягушонок", body: 2, head: "frog", eyes: "frog", bottom: "feet", arms: "arms" },
  { id: "octo", label: "Осьминожка", body: 0, head: "none", eyes: "two", bottom: "tentacles", arms: "arms" },
  { id: "cyclops", label: "Циклоп", body: 1, head: "horns", eyes: "one", bottom: "feet", arms: "arms" },
  { id: "ghost", label: "Призрак", body: 3, head: "none", eyes: "two", bottom: "none", arms: "arms" },
  { id: "unicorn", label: "Единорог", body: 0, head: "unicorn", eyes: "two", bottom: "feet", arms: "arms" },
];

export const TOTEM_COLORS: { id: string; label: string; hue: number }[] = [
  { id: "lime", label: "Лайм", hue: 78 },
  { id: "mint", label: "Мята", hue: 145 },
  { id: "teal", label: "Бирюза", hue: 172 },
  { id: "sky", label: "Небо", hue: 202 },
  { id: "indigo", label: "Индиго", hue: 236 },
  { id: "lilac", label: "Сирень", hue: 268 },
  { id: "fuchsia", label: "Фуксия", hue: 318 },
  { id: "coral", label: "Коралл", hue: 6 },
  { id: "tangerine", label: "Мандарин", hue: 26 },
  { id: "sun", label: "Солнце", hue: 46 },
];

export interface TotemChoice {
  kind?: string | null;
  color?: string | null;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const isTotemKind = (id: unknown): id is string => typeof id === "string" && TOTEM_KINDS.some((k) => k.id === id);
export const isTotemColor = (id: unknown): id is string => typeof id === "string" && TOTEM_COLORS.some((c) => c.id === id);

/** The person's creature: their pick, or one derived from the email. */
export function resolveTotem(seed: string, choice?: TotemChoice | null) {
  const h = hash(seed);
  const kind = TOTEM_KINDS.find((k) => k.id === choice?.kind) ?? TOTEM_KINDS[h % TOTEM_KINDS.length];
  const color = TOTEM_COLORS.find((c) => c.id === choice?.color) ?? TOTEM_COLORS[(h >>> 7) % TOTEM_COLORS.length];
  return { kind, color };
}
