/** Texts of the team-chat messages about project score zones. Edit the wording here (plain text, no markup). */

export type Zone = "green" | "yellow" | "red";

const RANK: Record<Zone, number> = { red: 0, yellow: 1, green: 2 };

const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;

export function zoneMessage(o: {
  /** First names of the project's MediaBuyer and SMM. */
  names: string[];
  project: string;
  score: number;
  from: Zone;
  to: Zone;
  /** The specialists' other projects still in yellow (or red, when none are yellow). */
  toImprove: string[];
}) {
  const p = `«${o.project}»`;
  const who = joinNames(o.names);
  const score = `${o.score}/100`;
  const many = o.names.length > 1;

  if (o.to === "green") {
    const thanks = who ? `${who}, спасибо ${many ? "вам за ваш" : "тебе за твой"} вклад и ответственность!` : "Спасибо команде за вклад и ответственность!";
    const more = o.toImprove.length
      ? `\n\nЕсли ещё ${many ? "улучшите" : "улучшишь"} результат на ${o.toImprove.map((x) => `«${x}»`).join(", ")}, будет вообще супер!`
      : "";
    return `🎉 Улучшился уровень! ${p} в зелёной зоне — ${score}.\n\n${thanks}${more}`;
  }
  if (RANK[o.to] > RANK[o.from]) {
    return `📈 Уровень растёт! ${p} выбрался из красной зоны — ${score}.${who ? `\n\n${who}, так держать — до зелёной совсем немного!` : ""}`;
  }
  if (o.to === "yellow") {
    return `⚠️ Обратите внимание: ${p} перешёл в жёлтую зону — ${score}.${who ? `\n\n${who}, ${many ? "посмотрите" : "посмотри"}, что просело. Если нужна помощь — ${many ? "пишите" : "пиши"}, разберёмся вместе.` : ""}`;
  }
  return `🔴 ${p} в красной зоне — ${score} (был в ${o.from === "green" ? "зелёной" : "жёлтой"}).${who ? `\n\n${who}, ${many ? "давайте" : "давай"} разберёмся вместе, что мешает результату.` : ""}`;
}
