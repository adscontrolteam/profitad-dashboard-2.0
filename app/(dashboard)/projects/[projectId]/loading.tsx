export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5">
      <div className="h-7 w-48 rounded-full bg-muted" />
      <div className="h-36 rounded-[var(--radius)] bg-muted" />
      <div className="h-48 rounded-[var(--radius)] bg-muted" />
    </div>
  );
}
