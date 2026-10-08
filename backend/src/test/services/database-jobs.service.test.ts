import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs, type DatabaseJob } from "../../db/schema.js";
import type { JobsQuery } from "../../schemas/jobs-query.schema.js";
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
const NOW = "2026-10-09T12:00:00.000Z";

function normalizeSql(expression: SQL) {
  const query = dialect.sqlToQuery(expression);

  return {
    sql: query.sql.replace(/\s+/g, " ").trim(),
    params: query.params,
  };
}

function actualFilter() {
  expect(dbMocks.where).toHaveBeenCalledTimes(1);

  const expression: SQL = dbMocks.where.mock.calls[0][0];

  return normalizeSql(expression);
}

function expectFilter(expected: SQL) {
  expect(actualFilter()).toEqual(normalizeSql(expected));
}

function createFilters(overrides: Partial<JobsQuery> = {}): JobsQuery {
  return {
    q: "",
    location: "",
    company: "",
    sources: [],
    postedWithin: "",
    ...overrides,
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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));

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

  afterEach(() => {
    vi.useRealTimers();
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

  it("includes only active jobs when no filters are supplied", async () => {
    await getStoredJobs();

    expectFilter(eq(jobs.isActive, true));
  });

  it("does not add conditions for empty filters", async () => {
    await getStoredJobs(createFilters());

    expectFilter(eq(jobs.isActive, true));
  });

  it("filters by a single selected source", async () => {
    await getStoredJobs(
      createFilters({
        sources: ["Himalayas"],
      }),
    );

    expectFilter(
      and(eq(jobs.isActive, true), inArray(jobs.source, ["Himalayas"]))!,
    );
  });

  it("matches any of the selected sources using IN", async () => {
    await getStoredJobs(
      createFilters({
        sources: ["Himalayas", "Remote OK"],
      }),
    );

    expectFilter(
      and(
        eq(jobs.isActive, true),
        inArray(jobs.source, ["Himalayas", "Remote OK"]),
      )!,
    );
  });

  it("uses a case-insensitive partial company match", async () => {
    await getStoredJobs(
      createFilters({
        company: "Example",
      }),
    );

    expectFilter(
      and(eq(jobs.isActive, true), ilike(jobs.company, "%Example%"))!,
    );
  });

  it("searches the title OR individual tags for a keyword", async () => {
    await getStoredJobs(
      createFilters({
        q: "React",
      }),
    );

    const keywordCondition = or(
      ilike(jobs.title, "%React%"),
      sql`
        EXISTS (
          SELECT 1
          FROM unnest(${jobs.tags}) AS job_tag(value)
          WHERE job_tag.value ILIKE ${"%React%"}
        )
      `,
    );

    expectFilter(and(eq(jobs.isActive, true), keywordCondition)!);
  });

  it("searches location OR country", async () => {
    await getStoredJobs(
      createFilters({
        location: "Singapore",
      }),
    );

    expectFilter(
      and(
        eq(jobs.isActive, true),
        or(
          ilike(jobs.location, "%Singapore%"),
          ilike(jobs.country, "%Singapore%"),
        ),
      )!,
    );
  });

  it.each([
    ["1", "2026-10-08T12:00:00.000Z"],
    ["7", "2026-10-02T12:00:00.000Z"],
    ["30", "2026-09-09T12:00:00.000Z"],
  ] as const)(
    "uses an inclusive cutoff and excludes future dates for postedWithin=%s",
    async (postedWithin, cutoff) => {
      await getStoredJobs(
        createFilters({
          postedWithin,
        }),
      );

      expectFilter(
        and(
          eq(jobs.isActive, true),
          gte(jobs.postedAt, cutoff),
          lte(jobs.postedAt, NOW),
        )!,
      );
    },
  );

  it("combines different filter groups with AND", async () => {
    await getStoredJobs(
      createFilters({
        sources: ["Himalayas", "Remote OK"],
        company: "Example",
        q: "React",
        location: "Singapore",
        postedWithin: "7",
      }),
    );

    const keywordCondition = or(
      ilike(jobs.title, "%React%"),
      sql`
        EXISTS (
          SELECT 1
          FROM unnest(${jobs.tags}) AS job_tag(value)
          WHERE job_tag.value ILIKE ${"%React%"}
        )
      `,
    );

    expectFilter(
      and(
        eq(jobs.isActive, true),
        inArray(jobs.source, ["Himalayas", "Remote OK"]),
        ilike(jobs.company, "%Example%"),
        keywordCondition,
        or(
          ilike(jobs.location, "%Singapore%"),
          ilike(jobs.country, "%Singapore%"),
        ),
        gte(jobs.postedAt, "2026-10-02T12:00:00.000Z"),
        lte(jobs.postedAt, NOW),
      )!,
    );
  });

  it.each([
    ["company", 1],
    ["q", 2],
    ["location", 2],
  ] as const)(
    "escapes wildcard characters and backslashes in %s",
    async (field, occurrences) => {
      const value = String.raw`Example_100%\Team`;
      const expectedPattern = String.raw`%Example\_100\%\\Team%`;

      await getStoredJobs(
        createFilters({
          [field]: value,
        }),
      );

      const query = actualFilter();

      expect(query.params).toEqual([
        true,
        ...Array.from({ length: occurrences }, () => expectedPattern),
      ]);

      // User text belongs in parameters, not the SQL statement.
      expect(query.sql).not.toContain(value);
    },
  );

  it("parameterizes SQL-looking input rather than inserting it into SQL", async () => {
    const keyword = "' OR 1=1 --";

    await getStoredJobs(
      createFilters({
        q: keyword,
      }),
    );

    const query = actualFilter();

    expect(query.params).toEqual([true, `%${keyword}%`, `%${keyword}%`]);

    expect(query.sql).not.toContain(keyword);
  });

  it("keeps source priority, newest-first ordering and an ID tie-breaker when filtered", async () => {
    await getStoredJobs(
      createFilters({
        company: "Example",
      }),
    );

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
    await expect(getStoredJobs()).resolves.toEqual([]);
  });

  it("returns an empty array when a filtered query has no results", async () => {
    await expect(
      getStoredJobs(
        createFilters({
          company: "No matching company",
        }),
      ),
    ).resolves.toEqual([]);
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

  it("does not mutate the database rows or supplied filters", async () => {
    const rows = [
      createRow({
        description: null,
        postedAt: "2026-10-08T08:00:00+08:00",
      }),
    ];

    const filters = createFilters({
      sources: ["Himalayas"],
      company: "Example",
      postedWithin: "7",
    });

    const originalRows = structuredClone(rows);
    const originalFilters = structuredClone(filters);

    dbMocks.orderBy.mockResolvedValueOnce(rows);

    await getStoredJobs(filters);

    expect(rows).toEqual(originalRows);
    expect(filters).toEqual(originalFilters);
  });
});
