import type { HealthZone } from "@/lib/domain/health";

/** Texts of the personal Telegram messages. Edit the wording here. */

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RANK: Record<Exclude<HealthZone, "none">, number> = { red: 0, yellow: 1, green: 2 };
const ZONE_WORD: Record<Exclude<HealthZone, "none">, string> = { green: "зелёной", yellow: "жёлтой", red: "красной" };

/** The message for one specialist about one project that changed zone. */
export function zoneMessage(o: {
  name: string;
  project: string;
  score: number;
  from: Exclude<HealthZone, "none">;
  to: Exclude<HealthZone, "none">;
  /** Other projects of this person that are still in yellow (or red, when none are yellow). */
  toImprove: string[];
}) {
  const p = `«${escapeHtml(o.project)}»`;
  const n = escapeHtml(o.name);
  if (o.to === "green") {
    const more = o.toImprove.length
      ? `\n\nЕсли ещё улучшишь результат на ${o.toImprove.map((x) => `«${escapeHtml(x)}»`).join(", ")}, будет вообще супер!`
      : "";
    return `🎉 <b>Улучшился уровень!</b>\n\n${n}, спасибо тебе за твой вклад и ответственность! Проект ${p} теперь в зелёной зоне — ${o.score}/100.${more}`;
  }
  if (RANK[o.to] > RANK[o.from]) {
    return `📈 <b>Уровень растёт!</b>\n\n${n}, проект ${p} выбрался из красной зоны — ${o.score}/100. Так держать, до зелёной совсем немного!`;
  }
  if (o.to === "yellow") {
    return `⚠️ <b>Проект просел</b>\n\n${n}, проект ${p} опустился в жёлтую зону — ${o.score}/100. Посмотри, что изменилось. Если нужна помощь — напиши, разберёмся вместе.`;
  }
  return `🔴 <b>Проект в красной зоне</b>\n\n${n}, проект ${p} сейчас ${o.score}/100 (был в ${ZONE_WORD[o.from]} зоне). Давай разберёмся вместе, что мешает результату — напиши, когда удобно.`;
}

