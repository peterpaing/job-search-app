import type { JobPage } from "./safe-job-page.service.js";

export type AvailabilityResult = {
  result: "active" | "closed" | "missing" | "unknown";
  reason: string;
  httpStatus: number | null;
  expiresAt: string | null;
};

type ListingIdentity = {
  title: string;
  company: string;
};

function unknown(
  reason: string,
  httpStatus: number | null,
): AvailabilityResult {
  return {
    result: "unknown",
    reason,
    httpStatus,
    expiresAt: null,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function collectJobPostings(
  value: unknown,
  postings: Record<string, unknown>[],
  depth = 0,
) {
  if (depth > 8 || postings.length > 20) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 100)) {
      collectJobPostings(entry, postings, depth + 1);
    }
    return;
  }

  if (!isObject(value)) {
    return;
  }

  const types = Array.isArray(value["@type"])
    ? value["@type"]
    : [value["@type"]];

  if (
    types.some(
      (type) =>
        type === "JobPosting" ||
        type === "https://schema.org/JobPosting" ||
        type === "http://schema.org/JobPosting",
    )
  ) {
    postings.push(value);
  }

  for (const entry of Object.values(value).slice(0, 100)) {
    collectJobPostings(entry, postings, depth + 1);
  }
}

function parseExpiry(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const midnight = new Date(`${value}T00:00:00.000Z`);

    if (
      !Number.isFinite(midnight.getTime()) ||
      midnight.toISOString().slice(0, 10) !== value
    ) {
      return null;
    }

    // Conservative: do not expire a date-only deadline
    // until that date has ended even in UTC-12.
    return new Date(midnight.getTime() + 36 * 60 * 60 * 1000 - 1);
  }

  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return null;
  }

  const expiry = new Date(value);

  return Number.isFinite(expiry.getTime()) ? expiry : null;
}

export function classifyJobPage(
  job: ListingIdentity,
  page: JobPage,
  now = new Date(),
): AvailabilityResult {
  if (page.status === 404 || page.status === 410) {
    return {
      result: "missing",
      reason: "listing_removed",
      httpStatus: page.status,
      expiresAt: null,
    };
  }

  if (page.status !== 200) {
    return unknown("unconfirmed_http_response", page.status);
  }

  const postings: Record<string, unknown>[] = [];

  const scripts = page.html.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  );

  for (const script of scripts) {
    try {
      const value: unknown = JSON.parse(script[1] ?? "");
      collectJobPostings(value, postings);
    } catch {
      // Invalid structured data is not closure evidence.
    }
  }

  // Avoid treating related jobs or search pages as this listing.
  if (postings.length !== 1) {
    return unknown("ambiguous_or_missing_job_data", 200);
  }

  const posting = postings[0]!;
  const organization = posting.hiringOrganization;

  if (
    typeof posting.title !== "string" ||
    !isObject(organization) ||
    typeof organization.name !== "string" ||
    normalize(posting.title) !== normalize(job.title) ||
    normalize(organization.name) !== normalize(job.company)
  ) {
    return unknown("listing_identity_unconfirmed", 200);
  }

  const expiry = parseExpiry(posting.validThrough);

  if (!expiry) {
    return unknown("listing_expiry_unconfirmed", 200);
  }

  const closed = expiry.getTime() <= now.getTime();

  return {
    result: closed ? "closed" : "active",
    reason: closed ? "listing_expired" : "verified_listing",
    httpStatus: 200,
    expiresAt: expiry.toISOString(),
  };
}
