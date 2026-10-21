"use client";

import Link from "next/link";
import { FiRefreshCw, FiZap } from "react-icons/fi";
import JobCard, { type Job } from "./JobCard";
import SmartMatchLoading from "./SmartMatchLoading";
import type { Match } from "../lib/smart-match.types";

type SmartMatchResultsProps = {
  matches: Match[];
  searched: number;
  exceptionalOnly: boolean;
  busy: boolean;
  matchesLoading: boolean;
  buttonClass: string;
  secondaryButtonClass: string;
  onExceptionalChange: (value: boolean) => void;
  onRefresh: () => void;
  onEditProfile: () => void;
  onOpenJobChat: (job: Job, trigger: HTMLButtonElement) => void;
};

export default function SmartMatchResults({
  matches,
  searched,
  exceptionalOnly,
  busy,
  matchesLoading,
  buttonClass,
  secondaryButtonClass,
  onExceptionalChange,
  onRefresh,
  onEditProfile,
  onOpenJobChat,
}: SmartMatchResultsProps) {
  const visibleMatches = exceptionalOnly
    ? matches.filter((match) => match.strength === "strong")
    : matches;

  const hiddenByStrengthFilter =
    exceptionalOnly && matches.length > 0 && visibleMatches.length === 0;

  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-primary text-xl font-semibold">
            Your matched jobs
          </h2>

          <p className="text-muted mt-2 max-w-3xl text-xs leading-relaxed">
            Based on your profile and available listing details.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-muted flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={exceptionalOnly}
              onChange={(event) => onExceptionalChange(event.target.checked)}
              className="accent-black"
            />
            Exceptional matches only
          </label>

          <button
            type="button"
            disabled={busy || matchesLoading}
            onClick={onRefresh}
            className={secondaryButtonClass}
          >
            <FiRefreshCw aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {matchesLoading ? (
        <div className="mt-6">
          <SmartMatchLoading />
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="border-border mt-6 flex min-h-[340px] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center">
          <FiZap aria-hidden="true" className="text-muted h-7 w-7" />

          <h3 className="text-primary mt-5 text-xl font-semibold">
            {hiddenByStrengthFilter
              ? "No exceptional matches yet"
              : "No matching jobs yet"}
          </h3>

          <p className="text-muted mt-3 max-w-md text-sm">
            {hiddenByStrengthFilter
              ? "Other matches are available. Clear this filter to see them."
              : "The available listing details don’t show a match yet. Try broader roles or preferences, or browse all jobs."}
          </p>

          {hiddenByStrengthFilter ? (
            <button
              type="button"
              onClick={() => onExceptionalChange(false)}
              className={`${buttonClass} mt-6`}
            >
              Show all matches
            </button>
          ) : (
            <button
              type="button"
              onClick={onEditProfile}
              className={`${buttonClass} mt-6`}
            >
              Edit profile
            </button>
          )}

          <Link href="/" className={`${secondaryButtonClass} mt-4`}>
            Explore all jobs
          </Link>
        </div>
      ) : (
        <>
          <p className="text-muted mt-6 text-sm">
            {visibleMatches.length} recommendations from {searched} recent
            listings
          </p>

          <div className="mt-5 grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleMatches.map((match) => (
              <JobCard
                key={match.job.id}
                job={match.job}
                matchDetails={{
                  strength: match.strength,
                  workMode: match.workMode ?? "unknown",
                  matchedSkills: match.matchedSkills,
                }}
                askDisabled={busy}
                onAsk={(trigger) => onOpenJobChat(match.job, trigger)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
