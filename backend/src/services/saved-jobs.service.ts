import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs, savedJobs, users, type DatabaseJob } from "../db/schema.js";
import { getOrCreateUser } from "./users.service.js";

function toSavedJob(job: DatabaseJob, savedAt: string) {
  return {
    id: job.id,
    source: job.source,
    title: job.title,
    company: job.company,
    companyLogo: job.companyLogo,
    description: job.description ?? "",
    location: job.location,
    tags: job.tags,
    url: job.url,
    postedAt: new Date(job.postedAt).toISOString(),
    isActive: job.isActive,
    savedAt: new Date(savedAt).toISOString(),
  };
}

export async function getSavedJobs(clerkUserId: string) {
  const rows = await db
    .select({
      job: jobs,
      savedAt: savedJobs.savedAt,
    })
    .from(savedJobs)
    .innerJoin(users, eq(savedJobs.userId, users.id))
    .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
    .where(eq(users.clerkUserId, clerkUserId))
    .orderBy(desc(savedJobs.savedAt), asc(savedJobs.jobId));

  return rows.map((row) => toSavedJob(row.job, row.savedAt));
}

export async function saveJob(clerkUserId: string, jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

  if (!job) {
    return null;
  }

  const user = await getOrCreateUser(clerkUserId);

  const [createdSave] = await db
    .insert(savedJobs)
    .values({
      userId: user.id,
      jobId,
    })
    .onConflictDoNothing({
      target: [savedJobs.userId, savedJobs.jobId],
    })
    .returning();

  if (createdSave) {
    return toSavedJob(job, createdSave.savedAt);
  }

  const [existingSave] = await db
    .select()
    .from(savedJobs)
    .where(and(eq(savedJobs.userId, user.id), eq(savedJobs.jobId, jobId)))
    .limit(1);

  if (!existingSave) {
    throw new Error("Unable to find the saved job");
  }

  return toSavedJob(job, existingSave.savedAt);
}

export async function unsaveJob(clerkUserId: string, jobId: string) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    return;
  }

  await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.userId, user.id), eq(savedJobs.jobId, jobId)));
}
