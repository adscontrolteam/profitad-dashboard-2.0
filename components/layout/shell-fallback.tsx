export function ShellFallback() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background lg:gap-3 lg:p-3" aria-busy="true">
      <div className="glass hidden rounded-[26px] lg:block lg:w-[248px]" />
      <div className="flex min-w-0 flex-1 animate-pulse flex-col gap-3 px-3 pt-3 lg:px-0 lg:pt-0">
        <div className="h-14 rounded-full bg-muted" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 rounded-[var(--radius)] bg-muted" />
          ))}
        </div>
        <div className="h-48 rounded-[var(--radius)] bg-muted" />
      </div>
    </div>
  );
}
