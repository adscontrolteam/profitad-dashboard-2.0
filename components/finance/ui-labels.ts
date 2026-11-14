const monthFmt = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });

/** «ноябрь 2026» — usable in client components. */
export const monthLabel = (m: string) => monthFmt.format(new Date(`${m}-01T00:00:00Z`)).replace(" г.", "");
