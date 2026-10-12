import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "../../db/schema.js";
import { getJobs } from "../../services/jobs.service.js";
import { importJobs } from "../../services/import-jobs.service.js";

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    insert: dbMocks.insert,
    execute: dbMocks.execute,
  },
}));

vi.mock("../../services/jobs.service.js", () => ({
  getJobs: vi.fn(),
}));

const getJobsMock = vi.mocked(getJobs);
const dialect = new PgDialect();

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

function createExpiringJob(expiresAt: string): SourceJob {
  return {
    id: "himalayas-expiring",
    source: "Himalayas",
    title: "Frontend Engineer",
    company: "Example",
    companyLogo: null,
    location: null,
    tags: ["React"],
    seniority: [],
    employmentType: null,
    url: "https://example.com/jobs/frontend",
    postedAt: "2026-10-08T00:00:00Z",
    expiresAt,
  };
}

describe("importJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(IMPORT_TIME));

    getJobsMock.mockReset();

    for (const mock of Object.values(dbMocks)) {
      mock.mockReset();
    }

    getJobsMock.mockResolvedValue([]);

    dbMocks.insert.mockReturnValue({
      values: dbMocks.values,
    });

    dbMocks.values.mockReturnValue({
      onConflictDoUpdate: dbMocks.onConflictDoUpdate,
    });

    dbMocks.onConflictDoUpdate.mockResolvedValue(undefined);

    dbMocks.execute.mockResolvedValue({
      rows: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches once and writes to jobs", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    expect(getJobsMock).toHaveBeenCalledTimes(1);
    expect(dbMocks.insert).toHaveBeenCalledWith(jobs);
  });

  it("maps the complete database row", async () => {
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

  it("preserves supplied description and country", async () => {
    const jobWithDetails = {
      ...createJob(),
      description: "Build developer tools.",
      country: "Singapore",
    };

    getJobsMock.mockResolvedValueOnce([jobWithDetails]);

    await importJobs();

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        description: "Build developer tools.",
        country: "Singapore",
      }),
    ]);
  });

  it("uses null for non-string optional fields", async () => {
    const invalidOptionalFields = {
      ...createJob(),
      description: 123,
      country: null,
    };

    // Deliberately simulate malformed source data to
    // exercise the importer's runtime safeguards.
    const malformedJob = invalidOptionalFields as unknown as SourceJob;

    getJobsMock.mockResolvedValueOnce([malformedJob]);

    await importJobs();

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        description: null,
        country: null,
      }),
    ]);
  });

  it("preserves missing logos, locations, and empty tags", async () => {
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

  it("normalizes dates to UTC", async () => {
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

  it("deduplicates IDs using the last supplied values", async () => {
    getJobsMock.mockResolvedValueOnce([
      createJob(),
      {
        ...createJob(),
        title: "Updated title",
      },
    ]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 2,
      processed: 1,
    });

    expect(dbMocks.values).toHaveBeenCalledWith([
      expect.objectContaining({
        title: "Updated title",
      }),
    ]);
  });

  it("keeps different source-prefixed IDs separate", async () => {
    getJobsMock.mockResolvedValueOnce([
      createJob(),
      {
        ...createJob(),
        id: "himalayas-1",
        source: "Himalayas",
      },
    ]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 2,
      processed: 2,
    });
  });

  it.each([
    [1, [1]],
    [100, [100]],
    [101, [100, 1]],
    [200, [100, 100]],
    [205, [100, 100, 5]],
  ])("batches %i jobs", async (count, expectedSizes) => {
    getJobsMock.mockResolvedValueOnce(createJobs(count));

    await expect(importJobs()).resolves.toEqual({
      fetched: count,
      processed: count,
    });

    expect(dbMocks.values.mock.calls.map(([batch]) => batch.length)).toEqual(
      expectedSizes,
    );
  });

  it("deduplicates before batching", async () => {
    const sourceJobs = createJobs(100);

    getJobsMock.mockResolvedValueOnce([...sourceJobs, ...sourceJobs]);

    await expect(importJobs()).resolves.toEqual({
      fetched: 200,
      processed: 100,
    });

    expect(dbMocks.insert).toHaveBeenCalledTimes(1);
  });

  it("does not write an empty feed", async () => {
    await expect(importJobs()).resolves.toEqual({
      fetched: 0,
      processed: 0,
    });

    expect(dbMocks.insert).not.toHaveBeenCalled();
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it("preserves existing availability during conflict updates", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    const options = dbMocks.onConflictDoUpdate.mock.calls[0][0];

    expect(options.target).toBe(jobs.id);

    expect(options.set.isActive).toEqual(sql`${jobs.isActive}`);

    expect(options.set.title).toEqual(sql`excluded."title"`);

    expect(options.set.lastSeenAt).toEqual(sql`excluded."last_seen_at"`);

    expect(options.set).not.toHaveProperty("createdAt");
  });

  it("leaves createdAt to the database default", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    expect(dbMocks.values.mock.calls[0][0][0]).not.toHaveProperty("createdAt");
  });

  it("records a supplied source expiry", async () => {
    const expiry = "2026-10-20T00:00:00.000Z";

    getJobsMock.mockResolvedValueOnce([createExpiringJob(expiry)]);

    await importJobs();

    expect(dbMocks.execute).toHaveBeenCalledTimes(1);

    const query = dialect.sqlToQuery(dbMocks.execute.mock.calls[0][0]);

    expect(query.sql).toContain("record_job_availability");

    expect(query.params).toContain("himalayas-expiring");

    expect(query.params).toContain(expiry);
  });

  it("does not invent an expiry for other sources", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it("rejects invalid expiry before writing", async () => {
    getJobsMock.mockResolvedValueOnce([createExpiringJob("invalid")]);

    await expect(importJobs()).rejects.toThrow(
      "Invalid expiresAt for job: himalayas-expiring",
    );

    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it.each(["not-a-date", ""])(
    "rejects invalid publication date %j",
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

  it("validates every job before the first batch", async () => {
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

  it("propagates source failures", async () => {
    getJobsMock.mockRejectedValueOnce(new Error("All job sources failed"));

    await expect(importJobs()).rejects.toThrow("All job sources failed");

    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("propagates database failures", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    dbMocks.onConflictDoUpdate.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    await expect(importJobs()).rejects.toThrow("Database unavailable");
  });

  it("stops later batches when an earlier batch fails", async () => {
    getJobsMock.mockResolvedValueOnce(createJobs(205));

    dbMocks.onConflictDoUpdate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Second batch failed"));

    await expect(importJobs()).rejects.toThrow("Second batch failed");

    expect(dbMocks.insert).toHaveBeenCalledTimes(2);
  });

  it("propagates expiry-recording failures", async () => {
    getJobsMock.mockResolvedValueOnce([
      createExpiringJob("2026-10-20T00:00:00Z"),
    ]);

    dbMocks.execute.mockRejectedValueOnce(new Error("Expiry write failed"));

    await expect(importJobs()).rejects.toThrow("Expiry write failed");
  });

  it("does not mutate fetched jobs", async () => {
    const sourceJobs = createJobs(2);
    const original = structuredClone(sourceJobs);

    getJobsMock.mockResolvedValueOnce(sourceJobs);

    await importJobs();

    expect(sourceJobs).toEqual(original);
  });
});
