"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import SaveJobButton from "./SaveJobButton";

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

export default function JobCard({ job }: { job: Job }) {
  const postedDate = new Date(job.postedAt);
  const hasValidDate = !Number.isNaN(postedDate.getTime());
  const logoUrl = job.companyLogo?.trim() || null;

  return (
    <article className="border-border bg-background flex min-h-[250px] flex-col rounded-2xl border p-5">
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
          aria-label={`View ${job.title} at ${job.company} (opens in a new tab)`}
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

      <div className="mt-auto flex items-start justify-between gap-3 pt-4">
        <p className="text-muted pt-2 text-xs">Source: {job.source}</p>

        <SaveJobButton job={job} />
      </div>
    </article>
  );
}
