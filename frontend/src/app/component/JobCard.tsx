import Image from "next/image";
import Link from "next/link";

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

export default function JobCard({ job }: { job: Job }) {
  const postedDate = new Date(job.postedAt);
  const hasValidDate = !Number.isNaN(postedDate.getTime());

  return (
    <article className="border-border bg-background flex flex-col rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {job.companyLogo ? (
            <Image
              src={job.companyLogo}
              alt={`${job.company} logo`}
              width={40}
              height={40}
              unoptimized
              className="bg-surface h-10 w-10 shrink-0 rounded-lg object-contain"
            />
          ) : (
            <span
              aria-hidden="true"
              className="bg-surface text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
            >
              {job.company.charAt(0).toUpperCase()}
            </span>
          )}

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

      <p className="text-muted mt-auto pt-4 text-xs">Source: {job.source}</p>
    </article>
  );
}