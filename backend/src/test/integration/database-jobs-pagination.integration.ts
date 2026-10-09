import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { jobs, type NewDatabaseJob } from "../../db/schema.js";
import { jobsQuerySchema } from "../../schemas/jobs-query.schema.js";
import { getStoredJobsPage } from "../../services/database-jobs.service.js";

let company: string;
let fixtureIds: string[];

beforeEach(async () => {
  const scope = randomUUID();
  company = `Pagination test ${scope}`;

  const rows: NewDatabaseJob[] = Array.from({ length: 24 }, (_, index) => ({
    id: `pagination-${scope}-${String(index + 1).padStart(2, "0")}`,
    source: index < 19 ? "Himalayas" : "Remote OK",
    title: `Developer ${index + 1}`,
    company,
    description: null,
    location: "Singapore",
    country: "Singapore",
    tags: ["react"],
    url: `https://example.com/jobs/${scope}/${index + 1}`,
    postedAt: "2026-10-08T00:00:00.000Z",
    isActive: index < 23,
  }));

  fixtureIds = rows.map((row) => row.id);

  await db.insert(jobs).values(rows);
});

afterEach(async () => {
  if (fixtureIds?.length) {
    await db.delete(jobs).where(inArray(jobs.id, fixtureIds));
  }
});

function filters(source?: string) {
  return jobsQuerySchema.parse({
    company,
    q: "react",
    ...(source ? { source } : {}),
  });
}

describe("getStoredJobsPage database integration", () => {
  it("returns 18 jobs and a total excluding inactive jobs", async () => {
    const result = await getStoredJobsPage(filters(), 1);

    expect(result.jobs).toHaveLength(18);
    expect(result.total).toBe(23);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(18);
    expect(result.totalPages).toBe(2);
    expect(result.jobs.map((job) => job.id)).toEqual(fixtureIds.slice(0, 18));
  });

  it("returns the next page without duplicates", async () => {
    const first = await getStoredJobsPage(filters(), 1);
    const second = await getStoredJobsPage(filters(), 2);

    expect(second.jobs).toHaveLength(5);
    expect(second.total).toBe(23);
    expect(second.page).toBe(2);
    expect(second.jobs.map((job) => job.id)).toEqual(fixtureIds.slice(18, 23));

    const combinedIds = [...first.jobs, ...second.jobs].map((job) => job.id);

    expect(new Set(combinedIds).size).toBe(23);
  });

  it("uses filtered totals to calculate pages", async () => {
    const result = await getStoredJobsPage(filters("Remote OK"), 1);

    expect(result.total).toBe(4);
    expect(result.jobs).toHaveLength(4);
    expect(result.totalPages).toBe(1);
    expect(result.jobs.every((job) => job.source === "Remote OK")).toBe(true);
  });

  it("clamps oversized pages", async () => {
    const result = await getStoredJobsPage(filters(), 999);

    expect(result.page).toBe(2);
    expect(result.jobs).toHaveLength(5);
  });

  it("returns empty metadata for unmatched searches", async () => {
    const result = await getStoredJobsPage(
      jobsQuerySchema.parse({
        company,
        q: `unmatched-${randomUUID()}`,
      }),
      999,
    );

    expect(result).toEqual({
      jobs: [],
      total: 0,
      page: 1,
      pageSize: 18,
      totalPages: 0,
    });
  });
});
