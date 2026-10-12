import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { applications, jobs, savedJobs } from "../db/schema.js";

const RETENTION_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export async function cleanupJobs() {
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * DAY_IN_MS,
  ).toISOString();

  const deletedJobs = await db
    .delete(jobs)
    .where(
      and(
        eq(jobs.isActive, false),

        sql`
          EXISTS (
            SELECT 1
            FROM public.job_availability AS availability
            WHERE
              availability.job_id = ${jobs.id}
              AND availability.closed_at
                < ${cutoff}::timestamptz
          )
        `,

        sql`
          NOT EXISTS (
            SELECT 1
            FROM ${savedJobs}
            WHERE ${savedJobs.jobId} = ${jobs.id}
          )
        `,

        sql`
          NOT EXISTS (
            SELECT 1
            FROM ${applications}
            WHERE ${applications.jobId} = ${jobs.id}
          )
        `,
      ),
    )
    .returning({ id: jobs.id });

  return {
    deleted: deletedJobs.length,
    cutoff,
  };
}
