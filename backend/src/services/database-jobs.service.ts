import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";

export async function getStoredJobs() {
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
    .where(eq(jobs.isActive, true))
    .orderBy(asc(sourcePriority), desc(jobs.postedAt), asc(jobs.id));

  return storedJobs.map((job) => ({
    ...job,
    description: job.description ?? "",
    postedAt: new Date(job.postedAt).toISOString(),
  }));
}
