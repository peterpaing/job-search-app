import { and, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs, savedJobs } from "../db/schema.js";

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
        lt(jobs.createdAt, cutoff),
        sql`
          NOT EXISTS (
            SELECT 1
            FROM ${savedJobs}
            WHERE ${savedJobs.jobId} = ${jobs.id}
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
