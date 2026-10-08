import { asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobs, type DatabaseJob } from "../../db/schema.js";
import { getStoredJobs } from "../../services/database-jobs.service.js";

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    select: dbMocks.select,
  },
}));

type QueryRow = Pick<
  DatabaseJob,
  | "id"
  | "source"
  | "title"
  | "company"
  | "companyLogo"
  | "description"
  | "location"
  | "country"
  | "tags"
  | "url"
  | "postedAt"
>;

const dialect = new PgDialect();

function normalizeSql(expression: SQL) {
  const query = dialect.sqlToQuery(expression);

  return {
    sql: query.sql.replace(/\s+/g, " ").trim(),
    params: query.params,
  };
}

function createRow(overrides: Partial<QueryRow> = {}): QueryRow {
  return {
    id: "remote-ok-123",
    source: "Remote OK",
    title: "Frontend Engineer",
    company: "Example",
    companyLogo: null,
    description: "Build developer tools.",
    location: "Singapore",
    country: null,
    tags: ["react", "typescript"],
    url: "https://remoteok.com/remote-jobs/example-123",
    postedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

describe("getStoredJobs", () => {
  beforeEach(() => {
    dbMocks.select.mockReset();
    dbMocks.from.mockReset();
    dbMocks.where.mockReset();
    dbMocks.orderBy.mockReset();

    dbMocks.select.mockReturnValue({
      from: dbMocks.from,
    });

    dbMocks.from.mockReturnValue({
      where: dbMocks.where,
    });

    dbMocks.where.mockReturnValue({
      orderBy: dbMocks.orderBy,
    });

    dbMocks.orderBy.mockResolvedValue([]);
  });

  it("selects public job fields from the jobs table", async () => {
    await getStoredJobs();

    expect(dbMocks.select).toHaveBeenCalledTimes(1);
    expect(dbMocks.select).toHaveBeenCalledWith({
      id: jobs.id,
      source: jobs.source,
      title: jobs.title,
      company: jobs.company,
      companyLogo: jobs.companyLogo,
      description: jobs.description,
      location: jobs.location,
      country: jobs.country,
      tags: jobs.tags,
      url: jobs.url,
      postedAt: jobs.postedAt,
    });

    expect(dbMocks.from).toHaveBeenCalledWith(jobs);
  });

  it("configures the query to include only active jobs", async () => {
    await getStoredJobs();

    expect(dbMocks.where).toHaveBeenCalledTimes(1);

    const actualFilter: SQL = dbMocks.where.mock.calls[0][0];

    expect(normalizeSql(actualFilter)).toEqual(
      normalizeSql(eq(jobs.isActive, true)),
    );
  });

  it("configures source priority, newest first within each source, and an ID tie-breaker", async () => {
    await getStoredJobs();

    const sourcePriority = sql<number>`
      CASE ${jobs.source}
        WHEN 'Himalayas' THEN 1
        WHEN 'Dev Global Jobs' THEN 2
        WHEN 'We Work Remotely' THEN 3
        WHEN 'Remote OK' THEN 4
        ELSE 5
      END
    `;

    expect(dbMocks.orderBy).toHaveBeenCalledTimes(1);

    const actualExpressions: SQL[] = dbMocks.orderBy.mock.calls[0];

    const expectedExpressions = [
      asc(sourcePriority),
      desc(jobs.postedAt),
      asc(jobs.id),
    ];

    expect(actualExpressions.map(normalizeSql)).toEqual(
      expectedExpressions.map(normalizeSql),
    );
  });

  it("returns stored jobs with normalized publication dates", async () => {
    const row = createRow();

    dbMocks.orderBy.mockResolvedValueOnce([row]);

    await expect(getStoredJobs()).resolves.toEqual([
      {
        ...row,
        postedAt: "2026-10-08T00:00:00.000Z",
      },
    ]);
  });

  it("returns an empty array when the database returns no jobs", async () => {
    dbMocks.orderBy.mockResolvedValueOnce([]);

    await expect(getStoredJobs()).resolves.toEqual([]);
  });

  it("converts a null description to an empty string", async () => {
    dbMocks.orderBy.mockResolvedValueOnce([createRow({ description: null })]);

    const result = await getStoredJobs();

    expect(result[0].description).toBe("");
  });

  it("preserves an existing description", async () => {
    dbMocks.orderBy.mockResolvedValueOnce([
      createRow({
        description: "Build accessible applications.",
      }),
    ]);

    const result = await getStoredJobs();

    expect(result[0].description).toBe("Build accessible applications.");
  });

  it("preserves null optional fields and empty tags", async () => {
    dbMocks.orderBy.mockResolvedValueOnce([
      createRow({
        companyLogo: null,
        location: null,
        country: null,
        tags: [],
      }),
    ]);

    const result = await getStoredJobs();

    expect(result[0]).toMatchObject({
      companyLogo: null,
      location: null,
      country: null,
      tags: [],
    });
  });

  it("preserves a supplied company logo and country", async () => {
    dbMocks.orderBy.mockResolvedValueOnce([
      createRow({
        companyLogo: "https://example.com/logo.png",
        country: "Singapore",
      }),
    ]);

    const result = await getStoredJobs();

    expect(result[0]).toMatchObject({
      companyLogo: "https://example.com/logo.png",
      country: "Singapore",
    });
  });

  it("converts a publication date with an offset to UTC", async () => {
    dbMocks.orderBy.mockResolvedValueOnce([
      createRow({
        postedAt: "2026-10-08T08:00:00+08:00",
      }),
    ]);

    const result = await getStoredJobs();

    expect(result[0].postedAt).toBe("2026-10-08T00:00:00.000Z");
  });

  it("preserves the row order supplied by the database", async () => {
    const rows = [
      createRow({
        id: "himalayas-1",
        source: "Himalayas",
      }),
      createRow({
        id: "dev-global-jobs-1",
        source: "Dev Global Jobs",
      }),
      createRow({
        id: "we-work-remotely-1",
        source: "We Work Remotely",
      }),
      createRow({
        id: "remote-ok-1",
        source: "Remote OK",
      }),
    ];

    dbMocks.orderBy.mockResolvedValueOnce(rows);

    const result = await getStoredJobs();

    expect(result.map((job) => job.id)).toEqual(rows.map((job) => job.id));
  });

  it("propagates database errors", async () => {
    const error = new Error("Database unavailable");

    dbMocks.orderBy.mockRejectedValueOnce(error);

    await expect(getStoredJobs()).rejects.toBe(error);
  });

  it("does not mutate the database rows", async () => {
    const rows = [
      createRow({
        description: null,
        postedAt: "2026-10-08T08:00:00+08:00",
      }),
    ];

    const original = structuredClone(rows);

    dbMocks.orderBy.mockResolvedValueOnce(rows);

    await getStoredJobs();

    expect(rows).toEqual(original);
  });
});
