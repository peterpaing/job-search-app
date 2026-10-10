import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "../../db/schema.js";
import { cleanupJobs } from "../../services/cleanup-jobs.service.js";

const dbMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    delete: dbMocks.delete,
  },
}));

const dialect = new PgDialect();

const NOW = new Date("2026-10-09T12:00:00.000Z");
const EXPECTED_CUTOFF = "2026-09-09T12:00:00.000Z";

describe("cleanupJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);

    dbMocks.delete.mockReset();
    dbMocks.where.mockReset();
    dbMocks.returning.mockReset();

    dbMocks.delete.mockReturnValue({
      where: dbMocks.where,
    });

    dbMocks.where.mockReturnValue({
      returning: dbMocks.returning,
    });

    dbMocks.returning.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes from the jobs table", async () => {
    await cleanupJobs();

    expect(dbMocks.delete).toHaveBeenCalledTimes(1);
    expect(dbMocks.delete).toHaveBeenCalledWith(jobs);
    expect(dbMocks.where).toHaveBeenCalledTimes(1);
    expect(dbMocks.returning).toHaveBeenCalledWith({
      id: jobs.id,
    });
  });

  it("deletes old jobs only when nobody has saved them", async () => {
    await cleanupJobs();

    const condition = dbMocks.where.mock.calls[0]?.[0] as SQL;
    const query = dialect.sqlToQuery(condition);
    const normalizedSql = query.sql.replace(/\s+/g, " ").trim();

    expect(normalizedSql).toContain('"jobs"."created_at" < $1');

    expect(normalizedSql).toContain("NOT EXISTS");
    expect(normalizedSql).toContain('FROM "saved_jobs"');

    expect(normalizedSql).toContain('"saved_jobs"."job_id" = "jobs"."id"');

    expect(query.params).toEqual([EXPECTED_CUTOFF]);
  });

  it("returns the number of deleted jobs and the cutoff", async () => {
    dbMocks.returning.mockResolvedValueOnce([
      { id: "remote-ok-123" },
      { id: "himalayas-example" },
      { id: "dev-global-jobs-456" },
    ]);

    await expect(cleanupJobs()).resolves.toEqual({
      deleted: 3,
      cutoff: EXPECTED_CUTOFF,
    });
  });

  it("returns zero when no jobs are old enough", async () => {
    await expect(cleanupJobs()).resolves.toEqual({
      deleted: 0,
      cutoff: EXPECTED_CUTOFF,
    });
  });

  it("recalculates the cutoff using the current time", async () => {
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));

    await expect(cleanupJobs()).resolves.toEqual({
      deleted: 0,
      cutoff: "2026-09-10T12:00:00.000Z",
    });
  });

  it("propagates database errors", async () => {
    const error = new Error("Database unavailable");

    dbMocks.returning.mockRejectedValueOnce(error);

    await expect(cleanupJobs()).rejects.toThrow(error);
  });
});
