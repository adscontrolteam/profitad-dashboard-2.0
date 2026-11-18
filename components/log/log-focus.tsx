import { cn } from "@/lib/cn";
import { ProjectLog, type LogItem } from "./project-log";

const WHAT: Record<"all" | "ads" | "smm", { log: string; focus: string }> = {
  all: { log: "реклама, SMM, план и доступы проекта", focus: "по всему проекту" },
  ads: { log: "только реклама", focus: "только по рекламе" },
  smm: { log: "только SMM", focus: "только по SMM" },
};

/**
 * «Лог» next to «Фокус», both open, each scrolls inside its block.
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
  const panel = "max-h-[70dvh] lg:h-[440px] lg:max-h-none";
  // Nothing in either block: both folded to one line. An entry in one of them opens both, so the pair stays level.
  const collapsed = items.length === 0;
  return (
    <section className={cn("grid gap-5 lg:grid-cols-2", className)}>
      <ProjectLog
        projectId={projectId}
        items={items}
        description={`Где поломка и что с ней сделать (${WHAT[scope].log}): не выдан доступ, не обновились данные, ошибка в настройке или в объявлении, заканчивается или перерасходуется бюджет, нарушено правило. Пишут агент-сторож и проверки дашборда. Запись уходит, когда вы её решили или причина исчезла.`}
        showArea={scope === "all"}
        panel
        collapsed={collapsed}
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
        collapsed={collapsed}
        only="focus"
        currency={currency}
        className={panel}
      />
    </section>
  );
}
