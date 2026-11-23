import { cn } from "@/lib/cn";
import { laneOf } from "@/lib/log/focus";
import { ProjectLog, type LogItem } from "./project-log";

const WHAT: Record<"all" | "ads" | "smm", { log: string; focus: string }> = {
  all: { log: "реклама, SMM, план и доступы проекта", focus: "по всему проекту" },
  ads: { log: "только реклама", focus: "только по рекламе" },
  smm: { log: "только SMM", focus: "только по SMM" },
};

/**
 * «Лог» next to «Фокус», each scrolls inside its block; an empty one is a single line.
 * Лог answers «где поломка», Фокус — «как улучшить результат».
 */
export function LogFocus({
  projectId,
  items,
  scope = "all",
  currency = null,
  className,
}: {
  projectId: string;
  items: LogItem[];
  /** Which entries the page passed: the whole project, or one area. */
  scope?: "all" | "ads" | "smm";
  currency?: string | null;
  className?: string;
}) {
  // As tall as its entries, up to a limit; longer lists scroll inside.
  const panel = "max-h-[70dvh] lg:max-h-[440px]";
  // A block with no entries of its own is folded to one line; it opens only when there is something to read in it.
  const logEmpty = !items.some((i) => laneOf(i) === "log");
  const focusEmpty = !items.some((i) => laneOf(i) === "focus");
  return (
    <section className={cn("grid items-start gap-5 lg:grid-cols-2", className)}>
      <ProjectLog
        projectId={projectId}
        items={items}
        description={`Где поломка и что с ней сделать (${WHAT[scope].log}): не выдан доступ, не обновились данные, ошибка в настройке или в объявлении, заканчивается или перерасходуется бюджет, нарушено правило. Пишут агент-сторож и проверки дашборда. Запись уходит, когда вы её решили или причина исчезла.`}
        showArea={scope === "all"}
        panel
        collapsed={logEmpty}
        only="log"
        currency={currency}
        className={panel}
      />
      <ProjectLog
        projectId={projectId}
        items={items}
        description={`Как улучшить результат (${WHAT[scope].focus}): предложения и анализ агента, что масштабировать, что проверить гипотезой, где нужно ваше решение. Сверху — самое дорогое по цене бездействия за неделю.`}
        showArea={scope === "all"}
        panel
        collapsed={focusEmpty}
        only="focus"
        currency={currency}
        className={panel}
      />
    </section>
  );
}
