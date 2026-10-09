"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  HiChevronLeft,
  HiChevronRight,
  HiOutlineMagnifyingGlass,
} from "react-icons/hi2";
import JobCard, { type Job } from "./JobCard";

const MAX_PAGE_BUTTONS = 4;

type JobsListProps = {
  jobs: Job[];
  page: number;
  totalPages: number;
};

export default function JobsList({ jobs, page, totalPages }: JobsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const jobsStartRef = useRef<HTMLDivElement>(null);

  const pageButtonCount = Math.min(totalPages, MAX_PAGE_BUTTONS);
  const firstVisiblePage = Math.max(
    1,
    Math.min(page - 2, totalPages - pageButtonCount + 1),
  );

  const visiblePages = Array.from(
    { length: pageButtonCount },
    (_, index) => firstVisiblePage + index,
  );

  function changePage(nextPage: number) {
    if (
      isPending ||
      nextPage === page ||
      nextPage < 1 ||
      nextPage > totalPages
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    if (nextPage === 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }

    const query = params.toString();
    const destination = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.push(destination, { scroll: false });
    });

    jobsStartRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }

  if (jobs.length === 0) {
    return (
      <div
        role="status"
        className="border-border bg-background flex min-h-[300px] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center sm:px-10"
      >
        <div className="bg-surface text-muted flex h-16 w-16 items-center justify-center rounded-full">
          <HiOutlineMagnifyingGlass className="h-8 w-8" aria-hidden="true" />
        </div>

        <h3 className="text-primary mt-5 text-lg font-semibold">
          No jobs found.
        </h3>

        <p className="text-muted mt-2 max-w-sm text-sm leading-relaxed">
          Try a different keyword, broaden your location, or remove some
          filters.
        </p>
      </div>
    );
  }

  return (
    <div ref={jobsStartRef} aria-busy={isPending} className="scroll-mt-24">
      <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Job pagination"
          className="mt-8 flex items-center justify-center gap-2"
        >
          <button
            type="button"
            aria-label="Previous page"
            disabled={page === 1 || isPending}
            onClick={() => changePage(page - 1)}
            className="text-primary hover:bg-surface focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <HiChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="flex gap-2 p-1">
            {visiblePages.map((pageNumber) => {
              const isCurrent = pageNumber === page;

              return (
                <button
                  key={pageNumber}
                  type="button"
                  aria-label={`Page ${pageNumber}`}
                  aria-current={isCurrent ? "page" : undefined}
                  disabled={isPending}
                  onClick={() => changePage(pageNumber)}
                  className={`focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait ${
                    isCurrent
                      ? "bg-primary text-background"
                      : "text-muted hover:bg-surface hover:text-primary"
                  }`}
                >
                  {pageNumber}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Next page"
            disabled={page === totalPages || isPending}
            onClick={() => changePage(page + 1)}
            className="text-primary hover:bg-surface focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <HiChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
