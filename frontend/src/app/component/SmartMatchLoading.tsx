export default function SmartMatchLoading() {
  return (
    <div role="status" aria-label="Loading SmartMatch" aria-busy="true">
      <span className="sr-only">Loading SmartMatch…</span>

      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="bg-surface h-9 w-52 rounded-full" />
        <div className="bg-surface mt-5 h-5 w-3/4 rounded" />

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="border-border rounded-2xl border p-6">
              <div className="bg-surface h-7 w-28 rounded-full" />
              <div className="bg-surface mt-6 h-6 w-3/4 rounded" />
              <div className="bg-surface mt-4 h-4 w-1/2 rounded" />
              <div className="bg-surface mt-6 h-24 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
