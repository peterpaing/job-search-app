export default function JobsLoading() {
  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        Loading jobs…
      </p>

      <div
        aria-hidden="true"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="border-border bg-background min-h-[250px] rounded-2xl border p-5 motion-safe:animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="bg-surface h-10 w-10 shrink-0 rounded-lg" />

              <div className="min-w-0 flex-1 space-y-2">
                <div className="bg-surface h-3 w-2/3 rounded" />
                <div className="bg-surface h-3 w-1/2 rounded" />
              </div>
            </div>

            <div className="bg-surface mt-6 h-5 w-4/5 rounded" />
            <div className="bg-surface mt-3 h-3 w-1/2 rounded" />

            <div className="mt-5 flex gap-2">
              <div className="bg-surface h-6 w-16 rounded-full" />
              <div className="bg-surface h-6 w-20 rounded-full" />
              <div className="bg-surface h-6 w-14 rounded-full" />
            </div>

            <div className="bg-surface mt-8 h-3 w-1/3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
