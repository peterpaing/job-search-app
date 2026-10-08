import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs, type NewDatabaseJob } from "../db/schema.js";
import { getJobs } from "./jobs.service.js";

const BATCH_SIZE = 100;

export async function importJobs() {
  const fetchedJobs = await getJobs();
  const now = new Date().toISOString();

  // Deduplicate matching IDs before writing to the database.
  const uniqueJobs = new Map<string, NewDatabaseJob>();

  for (const job of fetchedJobs) {
    const postedAt = new Date(job.postedAt);

    if (Number.isNaN(postedAt.getTime())) {
      throw new Error(`Invalid postedAt for job: ${job.id}`);
    }

    uniqueJobs.set(job.id, {
      id: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      companyLogo: job.companyLogo,
      description:
        "description" in job && typeof job.description === "string"
          ? job.description
          : null,
      location: job.location,
      country:
        "country" in job && typeof job.country === "string"
          ? job.country
          : null,
      tags: job.tags,
      url: job.url,
      postedAt: postedAt.toISOString(),
      isActive: true,
      lastSeenAt: now,
      updatedAt: now,
    });
  }

  const rows = [...uniqueJobs.values()];

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);

    await db
      .insert(jobs)
      .values(batch)
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          source: sql`excluded."source"`,
          title: sql`excluded."title"`,
          company: sql`excluded."company"`,
          companyLogo: sql`excluded."company_logo"`,
          description: sql`excluded."description"`,
          location: sql`excluded."location"`,
          country: sql`excluded."country"`,
          tags: sql`excluded."tags"`,
          url: sql`excluded."url"`,
          postedAt: sql`excluded."posted_at"`,
          isActive: sql`excluded."is_active"`,
          lastSeenAt: sql`excluded."last_seen_at"`,
          updatedAt: sql`excluded."updated_at"`,
        },
      });
  }

  return {
    fetched: fetchedJobs.length,
    processed: rows.length,
  };
}
