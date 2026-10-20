import { db } from "../db/index.js";
import {
  applications,
  jobs,
  users,
  type DatabaseApplication,
} from "../db/schema.js";
import { getOrCreateUser } from "./users.service.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

type ApplicationUpdate = {
  status?: DatabaseApplication["status"];
  notes?: string;
  expected?: {
    id: string;
    updatedAt: string;
  };
};

function normalizeApplication(application: DatabaseApplication) {
  return {
    id: application.id,
    jobId: application.jobId,
    title: application.title,
    company: application.company,
    url: application.url,
    status: application.status,
    notes: application.notes,
    appliedAt: new Date(application.appliedAt).toISOString(),
    updatedAt: new Date(application.updatedAt).toISOString(),
  };
}

function userIdsFor(clerkUserId: string) {
  return db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
}

export async function getApplications(clerkUserId: string) {
  const records = await db
    .select()
    .from(applications)
    .where(inArray(applications.userId, userIdsFor(clerkUserId)))
    .orderBy(desc(applications.appliedAt), applications.jobId);

  return records.map(normalizeApplication);
}

export async function trackApplication(clerkUserId: string, jobId: string) {
  const user = await getOrCreateUser(clerkUserId);

  const ownedJob = and(
    eq(applications.userId, user.id),
    eq(applications.jobId, jobId),
  );

  // Preserve existing status, notes, and application date.
  const [existing] = await db
    .select()
    .from(applications)
    .where(ownedJob)
    .limit(1);

  if (existing) {
    return normalizeApplication(existing);
  }

  const [job] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      url: jobs.url,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job) {
    return null;
  }

  const [created] = await db
    .insert(applications)
    .values({
      userId: user.id,
      jobId: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
    })
    .onConflictDoNothing({
      target: [applications.userId, applications.jobId],
    })
    .returning();

  if (created) {
    return normalizeApplication(created);
  }

  // Another request may have inserted the same application.
  const [concurrentRecord] = await db
    .select()
    .from(applications)
    .where(ownedJob)
    .limit(1);

  if (!concurrentRecord) {
    throw new Error("Unable to find the application record");
  }

  return normalizeApplication(concurrentRecord);
}

export async function updateApplication(
  clerkUserId: string,
  jobId: string,
  update: ApplicationUpdate,
) {
  const { expected, ...changes } = update;

  const ownedApplication = and(
    eq(applications.jobId, jobId),
    inArray(applications.userId, userIdsFor(clerkUserId)),
  );

  const [updated] = await db
    .update(applications)
    .set({
      ...changes,
      // API timestamps use millisecond precision. Ensure each successful
      // update advances the version, even for rapid consecutive saves.
      updatedAt: sql`
        greatest(
          date_trunc('milliseconds', clock_timestamp()),
          date_trunc('milliseconds', ${applications.updatedAt})
            + interval '1 millisecond'
        )
      `,
    })
    .where(
      and(
        ownedApplication,
        expected
          ? and(
              eq(applications.id, expected.id),
              sql`
                date_trunc('milliseconds', ${applications.updatedAt})
                  = ${expected.updatedAt}::timestamptz
              `,
            )
          : undefined,
      ),
    )
    .returning();

  if (updated) {
    return normalizeApplication(updated);
  }

  if (!expected) {
    return null;
  }

  const [current] = await db
    .select()
    .from(applications)
    .where(ownedApplication)
    .limit(1);

  if (!current) {
    return null;
  }

  return {
    conflict: true as const,
    current: normalizeApplication(current),
  };
}

export async function removeApplication(clerkUserId: string, jobId: string) {
  await db
    .delete(applications)
    .where(
      and(
        eq(applications.jobId, jobId),
        inArray(applications.userId, userIdsFor(clerkUserId)),
      ),
    );
}
