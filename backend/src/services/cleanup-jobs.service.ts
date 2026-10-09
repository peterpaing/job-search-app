import { lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";

const RETENTION_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export async function cleanupJobs() {
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * DAY_IN_MS,
  ).toISOString();

  const deletedJobs = await db
    .delete(jobs)
    .where(lt(jobs.createdAt, cutoff))
    .returning({ id: jobs.id });

  return {
    deleted: deletedJobs.length,
    cutoff,
  };
}
