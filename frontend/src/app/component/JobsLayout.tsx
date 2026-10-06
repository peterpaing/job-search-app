import type { ReactNode } from "react";
import JobFilters from "./JobFilters";

export default function JobsLayout({ children }: { children: ReactNode }) {
  return (
    <section className="bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h2 className="text-primary text-2xl font-semibold tracking-tight sm:text-3xl">
            Explore Developer Jobs
          </h2>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside
            aria-label="Job filters"
            className="border-border bg-background rounded-2xl border p-5"
          >
            <JobFilters />
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}
