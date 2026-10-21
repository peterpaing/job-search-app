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

    expect(dbMocks.delete).toHaveBeenCalledWith(jobs);
    expect(dbMocks.returning).toHaveBeenCalledWith({
      id: jobs.id,
    });
  });

  it("requires inactive status and 30 days since closure", async () => {
    await cleanupJobs();

    const condition = dbMocks.where.mock.calls[0]?.[0] as SQL;
    const query = dialect.sqlToQuery(condition);
    const normalizedSql = query.sql.replace(/\s+/g, " ").trim();

    expect(normalizedSql).toContain('"jobs"."is_active" = $1');
    expect(normalizedSql).toContain("public.job_availability");
    expect(normalizedSql).toContain('availability.job_id = "jobs"."id"');
    expect(normalizedSql).toContain("availability.closed_at < $2::timestamptz");

    expect(normalizedSql).not.toContain('"jobs"."created_at"');

    expect(query.params).toEqual([false, EXPECTED_CUTOFF]);
  });

  it("preserves jobs saved or tracked by any user", async () => {
    await cleanupJobs();

    const condition = dbMocks.where.mock.calls[0]?.[0] as SQL;
    const query = dialect.sqlToQuery(condition);
    const normalizedSql = query.sql.replace(/\s+/g, " ").trim();

    expect(normalizedSql).toContain('FROM "saved_jobs"');
    expect(normalizedSql).toContain('"saved_jobs"."job_id" = "jobs"."id"');

    expect(normalizedSql).toContain('FROM "applications"');
    expect(normalizedSql).toContain('"applications"."job_id" = "jobs"."id"');

    expect(normalizedSql.match(/NOT EXISTS/g)).toHaveLength(2);
  });

  it("returns the deleted count and cutoff", async () => {
    dbMocks.returning.mockResolvedValueOnce([
      { id: "remote-ok-123" },
      { id: "himalayas-example" },
    ]);

    await expect(cleanupJobs()).resolves.toEqual({
      deleted: 2,
      cutoff: EXPECTED_CUTOFF,
    });
  });

  it("returns zero when no jobs qualify", async () => {
    await expect(cleanupJobs()).resolves.toEqual({
      deleted: 0,
      cutoff: EXPECTED_CUTOFF,
    });
  });

  it("recalculates the cutoff", async () => {
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));

    await expect(cleanupJobs()).resolves.toEqual({
      deleted: 0,
      cutoff: "2026-09-10T12:00:00.000Z",
    });
  });

  it("propagates database errors", async () => {
    dbMocks.returning.mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(cleanupJobs()).rejects.toThrow("Database unavailable");
  });
});
 