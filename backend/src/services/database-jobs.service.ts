import {
  and,
  asc,
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

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const emptyQuery: JobsQuery = {
  q: "",
  location: "",
  company: "",
  sources: [],
  postedWithin: "",
};

function containsPattern(value: string) {
  // Treat %, _ and backslashes as literal search characters.
  const escaped = value.replace(/[\\%_]/g, "\\$&");

  return `%${escaped}%`;
}

export async function getStoredJobs(filters: JobsQuery = emptyQuery) {
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

  const sourcePriority = sql<number>`
    CASE ${jobs.source}
      WHEN 'Himalayas' THEN 1
      WHEN 'Dev Global Jobs' THEN 2
      WHEN 'We Work Remotely' THEN 3
      WHEN 'Remote OK' THEN 4
      ELSE 5
    END
  `;

  const storedJobs = await db
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
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(asc(sourcePriority), desc(jobs.postedAt), asc(jobs.id));

  return storedJobs.map((job) => ({
    ...job,
    description: job.description ?? "",
    postedAt: new Date(job.postedAt).toISOString(),
  }));
}
