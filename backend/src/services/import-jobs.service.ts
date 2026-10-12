import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs, type NewDatabaseJob } from "../db/schema.js";
import { getJobs } from "./jobs.service.js";

const BATCH_SIZE = 100;

type SourceExpiry = {
  id: string;
  url: string;
  expiresAt: string;
};

export async function importJobs() {
  const fetchedJobs = await getJobs();
  const now = new Date().toISOString();

  const uniqueJobs = new Map<string, NewDatabaseJob>();
  const sourceExpiries = new Map<string, SourceExpiry>();

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

    sourceExpiries.delete(job.id);

    if ("expiresAt" in job && typeof job.expiresAt === "string") {
      const expiry = new Date(job.expiresAt);

      if (!Number.isFinite(expiry.getTime())) {
        throw new Error(`Invalid expiresAt for job: ${job.id}`);
      }

      sourceExpiries.set(job.id, {
        id: job.id,
        url: job.url,
        expiresAt: expiry.toISOString(),
      });
    }
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

          // A feed appearance is not proof that a job reopened.
          isActive: sql`${jobs.isActive}`,

          lastSeenAt: sql`excluded."last_seen_at"`,
          updatedAt: sql`excluded."updated_at"`,
        },
      });

    for (const row of batch) {
      const expiry = sourceExpiries.get(row.id);

      if (!expiry) {
        continue;
      }

      await db.execute(sql`
        SELECT public.record_job_availability(
          ${expiry.id}::text,
          ${expiry.url}::text,
          'source'::text,
          'source_expiry'::text,
          NULL::integer,
          ${now}::timestamptz,
          ${expiry.expiresAt}::timestamptz
        )
      `);
    }
  }

  return {
    fetched: fetchedJobs.length,

    // Number of unique input jobs processed.
    // The database guard may skip closed tombstones.
    processed: rows.length,
  };
}
