"use client";

import { useRef, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import JobCard, { type Job } from "./JobCard";

const JOBS_PER_PAGE = 18;

export default function JobsList({ jobs }: { jobs: Job[] }) {
  const [page, setPage] = useState(1);
  const jobsStartRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const startIndex = (currentPage - 1) * JOBS_PER_PAGE;
  const visibleJobs = jobs.slice(startIndex, startIndex + JOBS_PER_PAGE);

  function changePage(nextPage: number) {
    setPage(nextPage);

    jobsStartRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }

  if (jobs.length === 0) {
    return <p className="text-muted">No jobs found.</p>;
  }

  return (
    <div ref={jobsStartRef} className="scroll-mt-24">
      <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleJobs.map((job) => (
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
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
            className="text-primary hover:bg-surface focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <HiChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="flex gap-2 overflow-x-auto p-1">
            {Array.from({ length: totalPages }, (_, index) => {
              const pageNumber = index + 1;
              const isCurrent = pageNumber === currentPage;

              return (
                <button
                  key={pageNumber}
                  type="button"
                  aria-label={`Page ${pageNumber}`}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => changePage(pageNumber)}
                  className={`focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
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
            disabled={currentPage === totalPages}
            onClick={() => changePage(currentPage + 1)}
            className="text-primary hover:bg-surface focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <HiChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
