import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import { getJobs } from "../../services/jobs.service.js";
import { importJobs } from "../../services/import-jobs.service.js";

vi.mock("../../services/jobs.service.js", () => ({
  getJobs: vi.fn(),
}));

const getJobsMock = vi.mocked(getJobs);

type SourceJob = Awaited<ReturnType<typeof getJobs>>[number];

const testIds = new Set<string>();

function createJob(): SourceJob {
  const id = `integration-test-${randomUUID()}`;

  testIds.add(id);

  return {
    id,
    source: "Remote OK",
    title: "Frontend Engineer",
    company: "Integration Test Company",
    companyLogo: null,
    location: "Singapore",
    tags: ["react", "typescript"],
    url: "https://example.com/jobs/integration-test",
    postedAt: "2026-10-08T00:00:00Z",
  };
}

async function findJob(id: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id));

  expect(rows).toHaveLength(1);

  return rows[0]!;
}

describe("importJobs database integration", () => {
  beforeAll(async () => {
    // Verify the migrated jobs table exists.
    await db.select({ id: jobs.id }).from(jobs).limit(1);
  });

  beforeEach(() => {
    getJobsMock.mockReset();
    getJobsMock.mockResolvedValue([]);
  });

  afterEach(async () => {
    const ids = [...testIds];

    if (ids.length > 0) {
      // Delete only rows created by this test file.
      await db.delete(jobs).where(inArray(jobs.id, ids));
    }

    testIds.clear();
  });

  it("stores a fetched job with database defaults", async () => {
    const job = createJob();

    getJobsMock.mockResolvedValueOnce([job]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 1,
      processed: 1,
    });

    const stored = await findJob(job.id);

    expect(stored).toMatchObject({
      id: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      companyLogo: null,
      description: null,
      location: "Singapore",
      country: null,
      tags: ["react", "typescript"],
      url: job.url,
      isActive: true,
    });

    expect(new Date(stored.postedAt).toISOString()).toBe(
      "2026-10-08T00:00:00.000Z",
    );

    for (const value of [
      stored.createdAt,
      stored.updatedAt,
      stored.lastSeenAt,
    ]) {
      expect(Number.isNaN(Date.parse(value))).toBe(false);
    }
  });

  it("updates a matching ID without duplicating the row", async () => {
    const job = createJob();

    getJobsMock.mockResolvedValueOnce([job]);
    await importJobs();

    const original = await findJob(job.id);

    // Set old timestamps so timestamp updates are clearly testable.
    const oldTimestamp = "2000-01-01T00:00:00.000Z";

    await db
      .update(jobs)
      .set({
        updatedAt: oldTimestamp,
        lastSeenAt: oldTimestamp,
      })
      .where(eq(jobs.id, job.id));

    getJobsMock.mockResolvedValueOnce([
      {
        ...job,
        title: "Senior Frontend Engineer",
        company: "Updated Company",
        location: "Malaysia",
        tags: ["react", "next.js"],
      },
    ]);

    await importJobs();

    const updated = await findJob(job.id);

    expect(updated).toMatchObject({
      title: "Senior Frontend Engineer",
      company: "Updated Company",
      location: "Malaysia",
      tags: ["react", "next.js"],
    });

    expect(updated.createdAt).toBe(original.createdAt);

    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(
      Date.parse(oldTimestamp),
    );

    expect(Date.parse(updated.lastSeenAt)).toBeGreaterThan(
      Date.parse(oldTimestamp),
    );
  });

  it("stores only one row for duplicate IDs in the same import", async () => {
    const job = createJob();

    getJobsMock.mockResolvedValueOnce([
      job,
      {
        ...job,
        title: "Updated Frontend Engineer",
      },
    ]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 2,
      processed: 1,
    });

    const stored = await findJob(job.id);

    expect(stored.title).toBe("Updated Frontend Engineer");
  });

  it("does not remove existing jobs when the fetched list is empty", async () => {
    const job = createJob();

    getJobsMock.mockResolvedValueOnce([job]);
    await importJobs();

    getJobsMock.mockResolvedValueOnce([]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 0,
      processed: 0,
    });

    const stored = await findJob(job.id);

    expect(stored.title).toBe(job.title);
  });
});
