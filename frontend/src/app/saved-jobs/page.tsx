"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import JobCard from "../component/JobCard";
import { useSavedJobs } from "../component/SavedJobsProvider";

const buttonClass =
  "bg-primary text-background focus-visible:outline-primary inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2";

const panelClass =
  "border-border flex min-h-[300px] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center sm:min-h-[340px] sm:px-8";

export default function SavedJobsPage() {
  const { signedIn, ready, savedJobs, error, reload } = useSavedJobs();

  return (
    <section className="bg-background min-h-[65svh] px-4 pt-10 pb-24 sm:px-6 sm:pt-12 sm:pb-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {error ? (
          <div role="alert" className={panelClass}>
            <h1 className="text-primary text-xl font-semibold">
              Couldn’t load saved jobs
            </h1>

            <p className="text-muted mt-3 max-w-md text-sm leading-relaxed">
              {error}
            </p>

            <button
              type="button"
              onClick={() => void reload()}
              className={`${buttonClass} mt-6`}
            >
              Try again
            </button>
          </div>
        ) : !ready ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Loading saved jobs…</span>

            <div aria-hidden="true" className="motion-safe:animate-pulse">
              <div className="bg-surface mb-6 h-10 w-36 rounded-full" />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    key={index}
                    className="border-border flex min-h-[250px] flex-col rounded-2xl border p-5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-surface h-10 w-10 shrink-0 rounded-lg" />

                      <div className="flex-1 space-y-2">
                        <div className="bg-surface h-4 w-2/3 rounded" />
                        <div className="bg-surface h-3 w-1/2 rounded" />
                      </div>
                    </div>

                    <div className="bg-surface mt-5 h-5 w-4/5 rounded" />
                    <div className="bg-surface mt-3 h-3 w-1/3 rounded" />

                    <div className="mt-4 flex gap-2">
                      <div className="bg-surface h-6 w-16 rounded-full" />
                      <div className="bg-surface h-6 w-20 rounded-full" />
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-6">
                      <div className="bg-surface h-3 w-1/3 rounded" />
                      <div className="bg-surface h-8 w-20 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : !signedIn ? (
          <div className={panelClass}>
            <h1 className="text-primary text-xl font-semibold">
              Your shortlist starts here
            </h1>

            <p className="text-muted mt-3 max-w-md text-sm leading-relaxed">
              Keep opportunities you want to revisit.
            </p>

            <SignInButton mode="modal" forceRedirectUrl="/saved-jobs">
              <button type="button" className={`${buttonClass} mt-6`}>
                Sign in to save jobs
              </button>
            </SignInButton>
          </div>
        ) : savedJobs.length === 0 ? (
          <div role="status" className={panelClass}>
            <h1 className="text-primary text-xl font-semibold">
              No saved jobs yet
            </h1>

            <p className="text-muted mt-3 max-w-md text-sm leading-relaxed">
              Keep opportunities you want to revisit.
            </p>

            <Link href="/" className={`${buttonClass} mt-6`}>
              Explore jobs
            </Link>
          </div>
        ) : (
          <>
            <h1 className="sr-only">Saved jobs</h1>

            <div className="mb-6 flex justify-start">
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="border-border bg-surface text-muted inline-flex items-center gap-1.5 rounded-full border px-5 py-2.5 text-sm"
              >
                <span className="text-primary font-semibold">
                  {savedJobs.length.toLocaleString("en-US")}
                </span>
                {savedJobs.length === 1 ? "saved job" : "saved jobs"}
              </p>
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {savedJobs.map((job) => (
                <div key={job.id}>
                  {!job.isActive && (
                    <p className="mb-2 text-xs text-amber-800">
                      This listing may no longer be available.
                    </p>
                  )}

                  <JobCard job={job} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
