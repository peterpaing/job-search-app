import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "../../db/schema.js";
import { jobsQuerySchema } from "../../schemas/jobs-query.schema.js";
import {
  getStoredJobsPage,
  type getStoredJobs,
} from "../../services/database-jobs.service.js";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  countFrom: vi.fn(),
  countWhere: vi.fn(),
  rowsFrom: vi.fn(),
  rowsWhere: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: { select: mocks.select },
}));

type PublicJob = Awaited<ReturnType<typeof getStoredJobs>>[number];
type QueryRow = Omit<PublicJob, "description"> & {
  description: string | null;
};

const dialect = new PgDialect();

function createRow(index = 1): QueryRow {
  return {
    id: `job-${index}`,
    source: "Himalayas",
    title: `Developer ${index}`,
    company: "Example",
    companyLogo: null,
    description: null,
    location: "Singapore",
    country: "Singapore",
    tags: ["react"],
    url: `https://example.com/jobs/${index}`,
    postedAt: "2026-10-08T08:00:00+08:00",
  };
}

describe("getStoredJobsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));

    mocks.select
      .mockReturnValueOnce({ from: mocks.countFrom })
      .mockReturnValue({ from: mocks.rowsFrom });

    mocks.countFrom.mockReturnValue({ where: mocks.countWhere });
    mocks.countWhere.mockResolvedValue([{ total: 39 }]);

    mocks.rowsFrom.mockReturnValue({ where: mocks.rowsWhere });
    mocks.rowsWhere.mockReturnValue({ orderBy: mocks.orderBy });
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockReturnValue({ offset: mocks.offset });
    mocks.offset.mockResolvedValue([createRow()]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns pagination metadata and normalized jobs", async () => {
    const result = await getStoredJobsPage();

    expect(result).toEqual({
      jobs: [
        {
          ...createRow(),
          description: "",
          postedAt: "2026-10-08T00:00:00.000Z",
        },
      ],
      total: 39,
      page: 1,
      pageSize: 18,
      totalPages: 3,
    });

    expect(mocks.countFrom).toHaveBeenCalledWith(jobs);
    expect(mocks.rowsFrom).toHaveBeenCalledWith(jobs);
    expect(mocks.limit).toHaveBeenCalledWith(18);
    expect(mocks.offset).toHaveBeenCalledWith(0);
  });

  it.each([
    [1, 0],
    [2, 18],
    [3, 36],
  ])("uses offset %i for page %i", async (page, offset) => {
    const result = await getStoredJobsPage(undefined, page);

    expect(result.page).toBe(page);
    expect(mocks.limit).toHaveBeenCalledWith(18);
    expect(mocks.offset).toHaveBeenCalledWith(offset);
  });

  it("returns the total matching count rather than the page length", async () => {
    mocks.offset.mockResolvedValueOnce(
      Array.from({ length: 18 }, (_, index) => createRow(index + 1)),
    );

    const result = await getStoredJobsPage();

    expect(result.jobs).toHaveLength(18);
    expect(result.total).toBe(39);
  });

  it("clamps an oversized page to the last available page", async () => {
    const result = await getStoredJobsPage(undefined, 999);

    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(3);
    expect(mocks.offset).toHaveBeenCalledWith(36);
  });

  it("returns empty metadata without fetching rows when nothing matches", async () => {
    mocks.countWhere.mockResolvedValueOnce([{ total: 0 }]);

    await expect(getStoredJobsPage(undefined, 999)).resolves.toEqual({
      jobs: [],
      total: 0,
      page: 1,
      pageSize: 18,
      totalPages: 0,
    });

    expect(mocks.rowsFrom).not.toHaveBeenCalled();
    expect(mocks.offset).not.toHaveBeenCalled();
  });

  it.each([
    [1, 1],
    [18, 1],
    [19, 2],
    [36, 2],
    [37, 3],
  ])("calculates %i matching jobs as %i pages", async (total, totalPages) => {
    mocks.countWhere.mockResolvedValueOnce([{ total }]);

    const result = await getStoredJobsPage();

    expect(result.totalPages).toBe(totalPages);
  });

  it("uses identical filters for counting and selecting rows", async () => {
    const filters = jobsQuerySchema.parse({
      q: "react",
      location: "Singapore",
      company: "Example",
      source: ["Himalayas", "Remote OK"],
      postedWithin: "7",
    });

    await getStoredJobsPage(filters, 2);

    const countWhere: SQL = mocks.countWhere.mock.calls[0][0];
    const rowsWhere: SQL = mocks.rowsWhere.mock.calls[0][0];

    expect(rowsWhere).toBe(countWhere);

    const query = dialect.sqlToQuery(countWhere);

    expect(query.params).toEqual([
      true,
      "Himalayas",
      "Remote OK",
      "%Example%",
      "%react%",
      "%react%",
      "%Singapore%",
      "%Singapore%",
      "2026-10-02T12:00:00.000Z",
      "2026-10-09T12:00:00.000Z",
    ]);
  });

  it("keeps stable source, date and ID ordering", async () => {
    await getStoredJobsPage();

    const expressions: SQL[] = mocks.orderBy.mock.calls[0];
    const order = expressions.map((expression) =>
      dialect.sqlToQuery(expression).sql.replace(/\s+/g, " ").trim(),
    );

    expect(order[0]).toContain("CASE");
    expect(order[0]).toContain("Himalayas");
    expect(order[1]).toBe('"jobs"."posted_at" desc');
    expect(order[2]).toBe('"jobs"."id" asc');
  });

  it.each([0, -1, 1.5, NaN, Infinity, 1_000_001])(
    "rejects invalid direct service page %s",
    async (page) => {
      await expect(getStoredJobsPage(undefined, page)).rejects.toThrow(
        "Invalid job page.",
      );

      expect(mocks.select).not.toHaveBeenCalled();
    },
  );

  it("propagates count-query failures", async () => {
    const error = new Error("Count query failed");
    mocks.countWhere.mockRejectedValueOnce(error);

    await expect(getStoredJobsPage()).rejects.toBe(error);
  });

  it("propagates page-query failures", async () => {
    const error = new Error("Page query failed");
    mocks.offset.mockRejectedValueOnce(error);

    await expect(getStoredJobsPage()).rejects.toBe(error);
  });

  it("does not mutate filters or database rows", async () => {
    const filters = jobsQuerySchema.parse({
      company: "Example",
      source: "Himalayas",
    });
    const row = createRow();
    const originalFilters = structuredClone(filters);
    const originalRow = structuredClone(row);

    mocks.offset.mockResolvedValueOnce([row]);

    await getStoredJobsPage(filters, 2);

    expect(filters).toEqual(originalFilters);
    expect(row).toEqual(originalRow);
  });
});
