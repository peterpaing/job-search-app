"use client";

import { useState, type ReactNode } from "react";
import { HiOutlineAdjustmentsHorizontal } from "react-icons/hi2";
import JobFilters from "./JobFilters";

export default function JobsLayout({ children }: { children: ReactNode }) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <section className="bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
          <h2 className="text-primary min-w-0 text-xl font-semibold tracking-tight sm:text-3xl">
            Explore Developer Jobs
          </h2>

          <button
            type="button"
            onClick={() => setShowFilters((previous) => !previous)}
            aria-label={showFilters ? "Hide filters" : "Show filters"}
            aria-expanded={showFilters}
            aria-controls="job-filters"
            className={`focus-visible:outline-primary inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4 sm:text-sm lg:hidden ${
              showFilters
                ? "border-primary bg-primary text-background"
                : "border-border bg-background text-primary hover:bg-surface"
            }`}
          >
            <HiOutlineAdjustmentsHorizontal
              className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
              aria-hidden="true"
            />
            Filters
          </button>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside
            id="job-filters"
            aria-label="Job filters"
            className={`border-border bg-background rounded-2xl border p-5 lg:block ${
              showFilters ? "block" : "hidden"
            }`}
          >
            <JobFilters />
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}
