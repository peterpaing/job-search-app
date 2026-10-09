import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";
import type { JobsQuery } from "../schemas/jobs-query.schema.js";

export const JOBS_PER_PAGE = 18;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const emptyQuery: JobsQuery = {
  q: "",
  location: "",
  company: "",
  sources: [],
  postedWithin: "",
};

function containsPattern(value: string) {
  const escaped = value.replace(/[\\%_]/g, "\\$&");

  return `%${escaped}%`;
}

function buildJobsWhere(filters: JobsQuery): SQL {
  const conditions: SQL[] = [eq(jobs.isActive, true)];

  if (filters.sources.length > 0) {
    conditions.push(inArray(jobs.source, filters.sources));
  }

  if (filters.company) {
    conditions.push(ilike(jobs.company, containsPattern(filters.company)));
  }

  if (filters.q) {
    const pattern = containsPattern(filters.q);

    const keywordCondition = or(
      ilike(jobs.title, pattern),
      sql`
        EXISTS (
          SELECT 1
          FROM unnest(${jobs.tags}) AS job_tag(value)
          WHERE job_tag.value ILIKE ${pattern}
        )
      `,
    );

    if (keywordCondition) {
      conditions.push(keywordCondition);
    }
  }

  if (filters.location) {
    const pattern = containsPattern(filters.location);

    const locationCondition = or(
      ilike(jobs.location, pattern),
      ilike(jobs.country, pattern),
    );

    if (locationCondition) {
      conditions.push(locationCondition);
    }
  }

  if (filters.postedWithin) {
    const now = new Date();
    const days = Number(filters.postedWithin);
    const cutoff = new Date(now.getTime() - days * DAY_IN_MS).toISOString();

    conditions.push(
      gte(jobs.postedAt, cutoff),
      lte(jobs.postedAt, now.toISOString()),
    );
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions)!;
}

function selectStoredJobs(where: SQL) {
  const sourcePriority = sql<number>`
    CASE ${jobs.source}
      WHEN 'Himalayas' THEN 1
      WHEN 'Dev Global Jobs' THEN 2
      WHEN 'We Work Remotely' THEN 3
      WHEN 'Remote OK' THEN 4
      ELSE 5
    END
  `;

  return db
    .select({
      id: jobs.id,
      source: jobs.source,
      title: jobs.title,
      company: jobs.company,
      companyLogo: jobs.companyLogo,
      description: jobs.description,
      location: jobs.location,
      country: jobs.country,
      tags: jobs.tags,
      url: jobs.url,
      postedAt: jobs.postedAt,
    })
    .from(jobs)
    .where(where)
    .orderBy(asc(sourcePriority), desc(jobs.postedAt), asc(jobs.id));
}

type StoredJobs = Awaited<ReturnType<typeof selectStoredJobs>>;

function normalizeJobs(storedJobs: StoredJobs) {
  return storedJobs.map((job) => ({
    ...job,
    description: job.description ?? "",
    postedAt: new Date(job.postedAt).toISOString(),
  }));
}

export async function getStoredJobs(filters: JobsQuery = emptyQuery) {
  const storedJobs = await selectStoredJobs(buildJobsWhere(filters));

  return normalizeJobs(storedJobs);
}

export async function getStoredJobsPage(
  filters: JobsQuery = emptyQuery,
  requestedPage = 1,
) {
  if (
    !Number.isSafeInteger(requestedPage) ||
    requestedPage < 1 ||
    requestedPage > 1_000_000
  ) {
    throw new RangeError("Invalid job page.");
  }

  // Both queries use the exact same search conditions and date cutoff.
  const where = buildJobsWhere(filters);

  const [countResult] = await db
    .select({ total: count() })
    .from(jobs)
    .where(where);

  const total = countResult?.total ?? 0;
  const totalPages = Math.ceil(total / JOBS_PER_PAGE);
  const page = Math.min(requestedPage, Math.max(totalPages, 1));

  if (total === 0) {
    return {
      jobs: [],
      total: 0,
      page: 1,
      pageSize: JOBS_PER_PAGE,
      totalPages: 0,
    };
  }

  const storedJobs = await selectStoredJobs(where)
    .limit(JOBS_PER_PAGE)
    .offset((page - 1) * JOBS_PER_PAGE);

  return {
    jobs: normalizeJobs(storedJobs),
    total,
    page,
    pageSize: JOBS_PER_PAGE,
    totalPages,
  };
}
