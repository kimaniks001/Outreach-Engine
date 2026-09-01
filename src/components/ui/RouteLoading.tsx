export function RouteLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="animate-pulse space-y-6" aria-hidden="true">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded bg-surface-border" />
          <div className="h-8 w-full max-w-md rounded bg-surface-border" />
          <div className="h-4 w-full max-w-2xl rounded bg-surface-border/70" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-40 rounded-xl border border-surface-border bg-surface-raised" />
          ))}
        </div>
      </div>
    </div>
  );
}
