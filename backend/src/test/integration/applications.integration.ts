import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { jobs, users } from "../../db/schema.js";
import {
  getApplications,
  trackApplication,
  updateApplication,
  removeApplication,
} from "../../services/applications.service.js";
import { getSavedJobs, saveJob } from "../../services/saved-jobs.service.js";
import { cleanupJobs } from "../../services/cleanup-jobs.service.js";

const fixtureJobs = new Set<string>();
const fixtureUsers = new Set<string>();

function clerkId() {
  const id = `user_application_test_${randomUUID()}`;
  fixtureUsers.add(id);
  return id;
}

async function createJob() {
  const id = `application-test-job-${randomUUID()}`;
  fixtureJobs.add(id);

  await db.insert(jobs).values({
    id,
    source: "Test",
    title: "Frontend Engineer",
    company: "Test Company",
    url: "https://example.com/jobs/test",
    postedAt: new Date().toISOString(),
    isActive: true,
  });

  return id;
}

describe("applications database integration", () => {
  beforeAll(() => {
    const testUrl = process.env.TEST_DATABASE_URL;

    if (!testUrl || process.env.DATABASE_URL !== testUrl) {
      throw new Error(
        "Use the integration configuration and a separate TEST_DATABASE_URL",
      );
    }
  });

  afterEach(async () => {
    try {
      if (fixtureUsers.size > 0) {
        await db
          .delete(users)
          .where(inArray(users.clerkUserId, [...fixtureUsers]));
      }

      if (fixtureJobs.size > 0) {
        await db.delete(jobs).where(inArray(jobs.id, [...fixtureJobs]));

        await db.execute(sql`
          DELETE FROM public.job_availability
          WHERE job_id IN (
            ${sql.join(
              [...fixtureJobs].map((id) => sql`${id}`),
              sql`, `,
            )}
          )
        `);
      }
    } finally {
      fixtureUsers.clear();
      fixtureJobs.clear();
    }
  });

  it("persists and retrieves an application", async () => {
    const owner = clerkId();
    const jobId = await createJob();

    const created = await trackApplication(owner, jobId);
    const records = await getApplications(owner);

    expect(created?.jobId).toBe(jobId);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      jobId,
      title: "Frontend Engineer",
      company: "Test Company",
      status: "applied",
      notes: "",
    });
  });

  it("preserves status, notes, and date on repeated tracking", async () => {
    const owner = clerkId();
    const jobId = await createJob();

    const first = await trackApplication(owner, jobId);

    await updateApplication(owner, jobId, {
      status: "interviewing",
      notes: "Friday interview",
    });

    const repeated = await trackApplication(owner, jobId);

    expect(repeated).toMatchObject({
      id: first?.id,
      appliedAt: first?.appliedAt,
      status: "interviewing",
      notes: "Friday interview",
    });

    expect(await getApplications(owner)).toHaveLength(1);
  });

  it("prevents duplicates during simultaneous tracking", async () => {
    const owner = clerkId();
    const jobId = await createJob();

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => trackApplication(owner, jobId)),
    );

    for (const result of results) {
      expect(result.status).toBe("fulfilled");

      if (result.status === "fulfilled") {
        expect(result.value?.jobId).toBe(jobId);
      }
    }

    expect(await getApplications(owner)).toHaveLength(1);
  });

  it("does not reveal another user's applications", async () => {
    const owner = clerkId();
    const other = clerkId();
    const jobId = await createJob();

    await trackApplication(owner, jobId);

    expect(await getApplications(other)).toEqual([]);
    expect(await getApplications(owner)).toHaveLength(1);
  });

  it("does not let another user update or delete an application", async () => {
    const owner = clerkId();
    const other = clerkId();
    const jobId = await createJob();

    await trackApplication(owner, jobId);

    const update = await updateApplication(other, jobId, {
      status: "rejected",
      notes: "Unauthorized change",
    });

    await removeApplication(other, jobId);

    expect(update).toBeNull();

    const [remaining] = await getApplications(owner);

    expect(remaining.status).toBe("applied");
    expect(remaining.notes).toBe("");
  });

  it("keeps separate records when two users track the same job", async () => {
    const first = clerkId();
    const second = clerkId();
    const jobId = await createJob();

    await trackApplication(first, jobId);
    await trackApplication(second, jobId);

    await updateApplication(first, jobId, {
      status: "offered",
    });

    expect((await getApplications(first))[0].status).toBe("offered");
    expect((await getApplications(second))[0].status).toBe("applied");
  });

  it("does not remove the saved job when removing an application", async () => {
    const owner = clerkId();
    const jobId = await createJob();

    await saveJob(owner, jobId);
    await trackApplication(owner, jobId);
    await removeApplication(owner, jobId);
    await removeApplication(owner, jobId);

    expect(await getApplications(owner)).toEqual([]);
    expect(await getSavedJobs(owner)).toHaveLength(1);
  });

  it("preserves tracked jobs and application history during cleanup", async () => {
    const owner = clerkId();
    const jobId = await createJob();

    await trackApplication(owner, jobId);

    await db.update(jobs).set({ isActive: false }).where(eq(jobs.id, jobId));

    await db.execute(sql`
      UPDATE public.job_availability
      SET closed_at = now() - interval '40 days'
      WHERE job_id = ${jobId}
    `);

    await cleanupJobs();

    const originalJob = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, jobId));

    expect(originalJob).toEqual([{ id: jobId }]);

    const [remaining] = await getApplications(owner);

    expect(remaining).toMatchObject({
      jobId,
      title: "Frontend Engineer",
      company: "Test Company",
      url: "https://example.com/jobs/test",
    });

    expect(
      await updateApplication(owner, jobId, {
        status: "offered",
      }),
    ).toMatchObject({ status: "offered" });
  });

  it("uses stored snapshots instead of later job edits", async () => {
    const owner = clerkId();
    const jobId = await createJob();

    await trackApplication(owner, jobId);

    await db
      .update(jobs)
      .set({
        title: "Changed listing title",
        company: "Changed company",
      })
      .where(eq(jobs.id, jobId));

    const [record] = await getApplications(owner);

    expect(record.title).toBe("Frontend Engineer");
    expect(record.company).toBe("Test Company");
  });

  it("returns null for a missing original job", async () => {
    const owner = clerkId();

    expect(await trackApplication(owner, `missing-${randomUUID()}`)).toBeNull();

    expect(await getApplications(owner)).toEqual([]);
  });
  it("rejects a stale save without overwriting the winning update", async () => {
    const owner = clerkId();
    const jobId = await createJob();
    const original = await trackApplication(owner, jobId);

    if (!original) {
      throw new Error("Expected a tracked application");
    }

    const expected = {
      id: original.id,
      updatedAt: original.updatedAt,
    };

    const winner = await updateApplication(owner, jobId, {
      notes: "Winning update",
      expected,
    });

    expect(winner).not.toHaveProperty("conflict");

    const stale = await updateApplication(owner, jobId, {
      notes: "Stale update",
      expected,
    });

    expect(stale).toMatchObject({
      conflict: true,
      current: { notes: "Winning update" },
    });

    const records = await getApplications(owner);

    expect(records[0]?.notes).toBe("Winning update");
  });
});
