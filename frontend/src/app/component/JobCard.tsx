"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FiMessageCircle } from "react-icons/fi";
import SaveJobButton from "./SaveJobButton";
import { useApplicationVisit } from "./ApplicationsProvider";

export type Job = {
  id: string;
  source: string;
  title: string;
  company: string;
  companyLogo: string | null;
  description: string;
  location: string | null;
  tags: string[];
  url: string;
  postedAt: string;
};

export type JobMatchDetails = {
  strength: "strong" | "partial" | "related";
  workMode: "remote" | "hybrid" | "on-site" | "unknown";
  matchedSkills: string[];
};

type JobCardProps = {
  job: Job;
  matchDetails?: JobMatchDetails;
  onAsk?: (trigger: HTMLButtonElement) => void;
  askDisabled?: boolean;
};

const companyColors = [
  "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-cyan-100 text-cyan-800",
];

function getCompanyInitial(company: string) {
  return Array.from(company.trim())[0]?.toUpperCase() || "?";
}

function getCompanyColors(initial: string) {
  const characterCode = initial.codePointAt(0) ?? 0;

  const colorIndex = /^[A-Z]$/.test(initial)
    ? (characterCode - 65) % companyColors.length
    : characterCode % companyColors.length;

  return companyColors[colorIndex];
}

function CompanyLogo({
  company,
  logoUrl,
}: {
  company: string;
  logoUrl: string | null;
}) {
  const [hasError, setHasError] = useState(false);
  const initial = getCompanyInitial(company);

  if (!logoUrl || hasError) {
    return (
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${getCompanyColors(initial)}`}
      >
        {initial}
      </span>
    );
  }

  return (
    <Image
      src={logoUrl}
      alt={`${company} logo`}
      width={40}
      height={40}
      unoptimized
      onError={() => setHasError(true)}
      className="bg-surface h-10 w-10 shrink-0 rounded-lg object-contain"
    />
  );
}

export default function JobCard({
  job,
  matchDetails,
  onAsk,
  askDisabled = false,
}: JobCardProps) {
  const recordVisit = useApplicationVisit();
  const postedDate = new Date(job.postedAt);
  const hasValidDate = !Number.isNaN(postedDate.getTime());
  const logoUrl = job.companyLogo?.trim() || null;

  const matchLabel =
    matchDetails?.strength === "strong"
      ? "Exceptional match"
      : matchDetails?.strength === "partial"
        ? "High match"
        : "Related role";

  const matchColors =
    matchDetails?.strength === "strong"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : matchDetails?.strength === "partial"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <article
      className={`border-border bg-background flex min-h-[250px] flex-col rounded-2xl border p-5 ${
        matchDetails ? "h-full" : ""
      }`}
    >
      {matchDetails && (
        <div className="border-border mb-4 flex flex-wrap items-center gap-2 border-b pb-4">
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${matchColors}`}
          >
            {matchLabel}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo
            key={JSON.stringify([job.company, logoUrl])}
            company={job.company}
            logoUrl={logoUrl}
          />

          <div className="min-w-0">
            <p className="text-primary text-sm font-medium">{job.company}</p>

            <p className="text-muted mt-1 text-xs">
              {job.location ?? "Location not specified"}
            </p>
          </div>
        </div>

        <Link
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View job details for ${job.title} at ${job.company} (opens in a new tab)`}
          onClick={(event) => {
            if (!event.defaultPrevented && event.button === 0) {
              recordVisit?.(job);
            }
          }}
          onAuxClick={(event) => {
            if (!event.defaultPrevented && event.button === 1) {
              recordVisit?.(job);
            }
          }}
          className="text-primary shrink-0 text-xs font-medium whitespace-nowrap hover:underline"
        >
          View job details
        </Link>
      </div>

      <h3 className="text-primary mt-4 text-lg font-semibold">{job.title}</h3>

      <p className="text-muted mt-2 text-xs">
        {hasValidDate ? (
          <>
            Posted{" "}
            <time dateTime={postedDate.toISOString()}>
              {postedDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </time>
          </>
        ) : (
          "Posted date unavailable"
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {job.tags.slice(0, 4).map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="bg-surface text-muted rounded-full px-2 py-1 text-xs"
          >
            {tag}
          </span>
        ))}
      </div>

      {matchDetails && (
        <div className="border-border mt-5 border-t pt-4">
          <p className="text-primary text-xs font-medium">
            Your matching skills
          </p>

          {matchDetails.matchedSkills.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {matchDetails.matchedSkills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800"
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-2 text-xs leading-relaxed">
              The role matches your preference, but the listing does not confirm
              your technical skills.
            </p>
          )}
        </div>
      )}

      <div className="mt-auto flex items-start justify-between gap-3 pt-5">
        <p className="text-muted pt-2 text-xs">Source: {job.source}</p>

        <SaveJobButton job={job} />
      </div>

      {onAsk && (
        <div className="border-border mt-4 border-t pt-4">
          <button
            type="button"
            disabled={askDisabled}
            aria-label={`Ask about this job: ${job.title} at ${job.company}`}
            onClick={(event) => onAsk(event.currentTarget)}
            className="bg-primary text-background focus-visible:outline-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiMessageCircle aria-hidden="true" className="h-4 w-4" />
            Ask about this job
          </button>
        </div>
      )}
    </article>
  );
}
