import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { jobs, users } from "../../db/schema.js";
import {
  getSavedJobs,
  saveJob,
  unsaveJob,
} from "../../services/saved-jobs.service.js";
import { cleanupJobs } from "../../services/cleanup-jobs.service.js";

const testJobIds = new Set<string>();
const testClerkIds = new Set<string>();

function createClerkId() {
  const id = `user_saved_test_${randomUUID()}`;
  testClerkIds.add(id);
  return id;
}

async function createJob() {
  const id = `saved-test-job-${randomUUID()}`;
  testJobIds.add(id);

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

describe("saved jobs database integration", () => {
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;

    if (!testUrl || process.env.DATABASE_URL !== testUrl) {
      throw new Error(
        "Use the integration configuration with a separate TEST_DATABASE_URL",
      );
    }
  });

  afterEach(async () => {
    try {
      if (testClerkIds.size > 0) {
        // Deleting fixture users also removes their saved rows.
        await db
          .delete(users)
          .where(inArray(users.clerkUserId, [...testClerkIds]));
      }

      if (testJobIds.size > 0) {
        await db.delete(jobs).where(inArray(jobs.id, [...testJobIds]));
      }
    } finally {
      testClerkIds.clear();
      testJobIds.clear();
    }
  });

  it("saves and returns the user's job", async () => {
    const clerkId = createClerkId();
    const jobId = await createJob();

    const saved = await saveJob(clerkId, jobId);

    expect(saved?.id).toBe(jobId);

    const result = await getSavedJobs(clerkId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(jobId);
  });

  it("does not create duplicate saves", async () => {
    const clerkId = createClerkId();
    const jobId = await createJob();

    const first = await saveJob(clerkId, jobId);
    const second = await saveJob(clerkId, jobId);

    expect(second?.savedAt).toBe(first?.savedAt);
    expect(await getSavedJobs(clerkId)).toHaveLength(1);
  });

  it("does not show another user's saved jobs", async () => {
    const owner = createClerkId();
    const otherUser = createClerkId();
    const jobId = await createJob();

    await saveJob(owner, jobId);

    expect(await getSavedJobs(owner)).toHaveLength(1);
    expect(await getSavedJobs(otherUser)).toEqual([]);
  });

  it("cannot remove another user's saved job", async () => {
    const owner = createClerkId();
    const otherUser = createClerkId();
    const jobId = await createJob();

    // Give both users database records.
    await saveJob(owner, jobId);
    await saveJob(otherUser, jobId);
    await unsaveJob(otherUser, jobId);

    expect(await getSavedJobs(otherUser)).toEqual([]);
    expect(await getSavedJobs(owner)).toHaveLength(1);
  });

  it("unsaving is safe to repeat", async () => {
    const clerkId = createClerkId();
    const jobId = await createJob();

    await saveJob(clerkId, jobId);
    await unsaveJob(clerkId, jobId);
    await unsaveJob(clerkId, jobId);

    expect(await getSavedJobs(clerkId)).toEqual([]);
  });

  it("does not save a nonexistent job", async () => {
    const clerkId = createClerkId();

    const result = await saveJob(clerkId, `missing-${randomUUID()}`);

    expect(result).toBeNull();
    expect(await getSavedJobs(clerkId)).toEqual([]);
  });

  it("prevents duplicates during simultaneous saves", async () => {
    const clerkId = createClerkId();
    const jobId = await createJob();

    // Wait for every request before cleanup starts.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => saveJob(clerkId, jobId)),
    );

    for (const result of results) {
      expect(result.status).toBe("fulfilled");

      if (result.status === "fulfilled") {
        expect(result.value?.id).toBe(jobId);
      }
    }

    expect(await getSavedJobs(clerkId)).toHaveLength(1);
  });

  it("retains old saved jobs while cleaning old unsaved jobs", async () => {
    const clerkId = createClerkId();
    const savedJobId = await createJob();
    const unsavedJobId = await createJob();

    const oldDate = new Date(
      Date.now() - 40 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await db
      .update(jobs)
      .set({ createdAt: oldDate })
      .where(inArray(jobs.id, [savedJobId, unsavedJobId]));

    await saveJob(clerkId, savedJobId);
    await cleanupJobs();

    const remainingSavedJob = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, savedJobId));

    const removedUnsavedJob = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, unsavedJobId));

    expect(remainingSavedJob).toHaveLength(1);
    expect(removedUnsavedJob).toEqual([]);
    expect(await getSavedJobs(clerkId)).toHaveLength(1);
  });
});
