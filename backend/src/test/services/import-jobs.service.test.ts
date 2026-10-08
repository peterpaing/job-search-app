import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "../../db/schema.js";
import { getJobs } from "../../services/jobs.service.js";
import { importJobs } from "../../services/import-jobs.service.js";

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    insert: dbMocks.insert,
  },
}));

vi.mock("../../services/jobs.service.js", () => ({
  getJobs: vi.fn(),
}));

const getJobsMock = vi.mocked(getJobs);

type SourceJob = Awaited<ReturnType<typeof getJobs>>[number];

const IMPORT_TIME = "2026-10-10T12:00:00.000Z";

function createJob(index = 1): SourceJob {
  return {
    id: `remote-ok-${index}`,
    source: "Remote OK",
    title: `Frontend Engineer ${index}`,
    company: "Example",
    companyLogo: "https://example.com/logo.png",
    location: "Singapore",
    tags: ["react", "typescript"],
    url: `https://remoteok.com/remote-jobs/example-${index}`,
    postedAt: "2026-10-08T00:00:00Z",
  };
}

function createJobs(count: number): SourceJob[] {
  return Array.from({ length: count }, (_, index) => createJob(index + 1));
}

describe("importJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(IMPORT_TIME));

    getJobsMock.mockReset();
    dbMocks.insert.mockReset();
    dbMocks.values.mockReset();
    dbMocks.onConflictDoUpdate.mockReset();

    getJobsMock.mockResolvedValue([]);

    dbMocks.insert.mockReturnValue({
      values: dbMocks.values,
    });

    dbMocks.values.mockReturnValue({
      onConflictDoUpdate: dbMocks.onConflictDoUpdate,
    });

    dbMocks.onConflictDoUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches jobs once and inserts into the jobs table", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    expect(getJobsMock).toHaveBeenCalledTimes(1);
    expect(dbMocks.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.insert).toHaveBeenCalledWith(jobs);
  });

  it("maps a source job to the database fields", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    expect(dbMocks.values).toHaveBeenCalledWith([
      {
        id: "remote-ok-1",
        source: "Remote OK",
        title: "Frontend Engineer 1",
        company: "Example",
        companyLogo: "https://example.com/logo.png",
        description: null,
        location: "Singapore",
        country: null,
        tags: ["react", "typescript"],
        url: "https://remoteok.com/remote-jobs/example-1",
        postedAt: "2026-10-08T00:00:00.000Z",
        isActive: true,
        lastSeenAt: IMPORT_TIME,
        updatedAt: IMPORT_TIME,
      },
    ]);
  });

  it("preserves description and country when supplied", async () => {
    const job = {
      ...createJob(),
      description: "Build developer tools.",
      country: "Singapore",
    };

    getJobsMock.mockResolvedValueOnce([job]);

    await importJobs();

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        description: "Build developer tools.",
        country: "Singapore",
      }),
    ]);
  });

  it("uses null for non-string description and country", async () => {
    const job = {
      ...createJob(),
      description: 123,
      country: null,
    };

    getJobsMock.mockResolvedValueOnce([job]);

    await importJobs();

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        description: null,
        country: null,
      }),
    ]);
  });

  it("preserves missing logos, locations and empty tags", async () => {
    getJobsMock.mockResolvedValueOnce([
      {
        ...createJob(),
        companyLogo: null,
        location: null,
        tags: [],
      },
    ]);

    await importJobs();

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        companyLogo: null,
        location: null,
        tags: [],
      }),
    ]);
  });

  it("normalizes publication dates to UTC ISO strings", async () => {
    getJobsMock.mockResolvedValueOnce([
      {
        ...createJob(),
        postedAt: "2026-10-08T08:00:00+08:00",
      },
    ]);

    await importJobs();

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        postedAt: "2026-10-08T00:00:00.000Z",
      }),
    ]);
  });

  it("deduplicates matching IDs and keeps the last supplied values", async () => {
    const original = createJob();
    const updated = {
      ...original,
      title: "Senior Frontend Engineer",
    };

    getJobsMock.mockResolvedValueOnce([original, updated]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 2,
      processed: 1,
    });

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        id: original.id,
        title: "Senior Frontend Engineer",
      }),
    ]);
  });

  it("keeps different source-prefixed IDs as separate jobs", async () => {
    const remoteOkJob = createJob();
    const himalayasJob = {
      ...createJob(),
      id: "himalayas-1",
      source: "Himalayas",
    };

    getJobsMock.mockResolvedValueOnce([remoteOkJob, himalayasJob]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 2,
      processed: 2,
    });

    expect(dbMocks.values.mock.calls[0][0]).toHaveLength(2);
  });

  it.each([
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [200, [100, 100]],
    [205, [100, 100, 5]],
  ])(
    "imports %i unique jobs in batches of at most 100",
    async (count, expectedBatchSizes) => {
      getJobsMock.mockResolvedValueOnce(createJobs(count));

      await expect(importJobs()).resolves.toEqual({
        fetched: count,
        processed: count,
      });

      expect(dbMocks.insert).toHaveBeenCalledTimes(expectedBatchSizes.length);

      const batchSizes = dbMocks.values.mock.calls.map(
        ([batch]) => batch.length,
      );

      expect(batchSizes).toEqual(expectedBatchSizes);
      expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledTimes(
        expectedBatchSizes.length,
      );
    },
  );

  it("deduplicates jobs before splitting them into batches", async () => {
    const uniqueJobs = createJobs(100);

    getJobsMock.mockResolvedValueOnce([...uniqueJobs, ...uniqueJobs]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 200,
      processed: 100,
    });

    expect(dbMocks.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.values.mock.calls[0][0]).toHaveLength(100);
  });

  it("returns zero counts without writing when no jobs are fetched", async () => {
    getJobsMock.mockResolvedValueOnce([]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 0,
      processed: 0,
    });

    expect(dbMocks.insert).not.toHaveBeenCalled();
    expect(dbMocks.values).not.toHaveBeenCalled();
    expect(dbMocks.onConflictDoUpdate).not.toHaveBeenCalled();
  });

  it("configures updates using incoming values for matching IDs", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledWith({
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
  });

  it("leaves createdAt to the database default and does not update it", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    const insertedRow = dbMocks.values.mock.calls[0][0][0];
    const conflictOptions = dbMocks.onConflictDoUpdate.mock.calls[0][0];

    expect(insertedRow).not.toHaveProperty("createdAt");
    expect(conflictOptions.set).not.toHaveProperty("createdAt");
  });

  it.each(["not-a-date", ""])(
    "rejects an invalid publication date: %j",
    async (postedAt) => {
      getJobsMock.mockResolvedValueOnce([
        {
          ...createJob(),
          postedAt,
        },
      ]);

      await expect(importJobs()).rejects.toThrow(
        "Invalid postedAt for job: remote-ok-1",
      );

      expect(dbMocks.insert).not.toHaveBeenCalled();
    },
  );

  it("validates every job before writing any batch", async () => {
    getJobsMock.mockResolvedValueOnce([
      ...createJobs(100),
      {
        ...createJob(101),
        postedAt: "invalid",
      },
    ]);

    await expect(importJobs()).rejects.toThrow(
      "Invalid postedAt for job: remote-ok-101",
    );

    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("propagates source-fetch failures without writing", async () => {
    const error = new Error("All job sources failed");

    getJobsMock.mockRejectedValueOnce(error);

    await expect(importJobs()).rejects.toBe(error);

    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("propagates database failures", async () => {
    const error = new Error("Database unavailable");

    getJobsMock.mockResolvedValueOnce([createJob()]);
    dbMocks.onConflictDoUpdate.mockRejectedValueOnce(error);

    await expect(importJobs()).rejects.toBe(error);
  });

  it("stops importing later batches when a batch fails", async () => {
    const error = new Error("Second batch failed");

    getJobsMock.mockResolvedValueOnce(createJobs(205));

    dbMocks.onConflictDoUpdate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);

    await expect(importJobs()).rejects.toBe(error);

    expect(dbMocks.insert).toHaveBeenCalledTimes(2);
    expect(dbMocks.onConflictDoUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not mutate the fetched jobs", async () => {
    const fetchedJobs = createJobs(2);
    const original = structuredClone(fetchedJobs);

    getJobsMock.mockResolvedValueOnce(fetchedJobs);

    await importJobs();

    expect(fetchedJobs).toEqual(original);
  });
});
