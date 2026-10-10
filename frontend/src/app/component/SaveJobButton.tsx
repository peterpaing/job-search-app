"use client";

import { SignInButton } from "@clerk/nextjs";
import { HiBookmark, HiOutlineBookmark } from "react-icons/hi2";
import type { Job } from "./JobCard";
import { useSavedJobs } from "./SavedJobsProvider";

const buttonClass =
  "border-border text-primary hover:bg-surface focus-visible:outline-primary inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default";

export default function SaveJobButton({ job }: { job: Job }) {
  const { signedIn, ready, savedJobs, pendingJobIds, error, setSaved } =
    useSavedJobs();

  const saved = savedJobs.some((item) => item.id === job.id);
  const pending = pendingJobIds.includes(job.id);

  if (ready && !signedIn) {
    return (
      <SignInButton mode="modal">
        <button
          type="button"
          aria-label={`Sign in to save ${job.title}`}
          className={buttonClass}
        >
          <HiOutlineBookmark className="h-4 w-4" aria-hidden="true" />
          Save
        </button>
      </SignInButton>
    );
  }

  const Icon = saved ? HiBookmark : HiOutlineBookmark;

  return (
    <button
      type="button"
      onClick={() => void setSaved(job, !saved)}
      disabled={!ready || pending}
      aria-pressed={saved}
      aria-label={saved ? `Unsave ${job.title}` : `Save ${job.title}`}
      title={error ?? undefined}
      className={buttonClass}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {saved ? "Saved" : "Save"}
    </button>
  );
}
