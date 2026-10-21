import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
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
import { jobs, type NewDatabaseJob } from "../../db/schema.js";
import type { JobsQuery } from "../../schemas/jobs-query.schema.js";
import { getStoredJobs } from "../../services/database-jobs.service.js";

const NOW = "2026-10-09T12:00:00.000Z";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const testIds = new Set<string>();
let companyPrefix = "";

function dateDaysAgo(days: number) {
  return new Date(Date.parse(NOW) - days * DAY_IN_MS).toISOString();
}

async function storeJobs(overrides: Partial<NewDatabaseJob>[]) {
  const rows = overrides.map((override) => {
    const id = `integration-test-${randomUUID()}`;

    const row: NewDatabaseJob = {
      source: "Remote OK",
      title: "Frontend Engineer",
      companyLogo: null,
      description: null,
      location: null,
      country: null,
      tags: [],
      url: "https://example.com/jobs/integration-test",
      postedAt: dateDaysAgo(1),
      isActive: true,
      ...override,
      id,
      company: `${companyPrefix} ${override.company ?? "Example"}`,
    };

    testIds.add(id);

    return row;
  });

  await db.insert(jobs).values(rows);

  return rows;
}

function filters(overrides: Partial<JobsQuery> = {}): JobsQuery {
  return {
    q: "",
    location: "",
    company: companyPrefix,
    sources: [],
    postedWithin: "",
    ...overrides,
  };
}

function expectMatchingIds(
  result: Awaited<ReturnType<typeof getStoredJobs>>,
  expectedIds: string[],
) {
  expect(result.map((job) => job.id).sort()).toEqual([...expectedIds].sort());
}

describe("getStoredJobs database integration", () => {
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;

    if (!testUrl || process.env.DATABASE_URL !== testUrl) {
      throw new Error(
        "Run this file using the integration configuration and a separate TEST_DATABASE_URL",
      );
    }

    // Verify that migrations have created the table.
    await db.select({ id: jobs.id }).from(jobs).limit(1);
  });

  beforeEach(() => {
    companyPrefix = `test-company-${randomUUID()}`;
    testIds.clear();

    // Freeze Date only. Network timers continue working normally.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(async () => {
    try {
      const ids = [...testIds];

      if (ids.length > 0) {
        await db.delete(jobs).where(inArray(jobs.id, ids));
      }
    } finally {
      testIds.clear();
      vi.useRealTimers();
    }
  });

  it("returns active jobs and excludes inactive jobs", async () => {
    const [active, inactive] = await storeJobs([
      { isActive: true },
      { isActive: false },
    ]);

    const result = await getStoredJobs(filters());

    expectMatchingIds(result, [active.id]);
    expect(result.map((job) => job.id)).not.toContain(inactive.id);
  });

  it("matches a keyword in the title or an individual tag", async () => {
    const [titleMatch, tagMatch] = await storeJobs([
      {
        title: "Senior React Developer",
        tags: ["javascript"],
      },
      {
        title: "Frontend Engineer",
        tags: ["react", "typescript"],
      },
      {
        title: "Backend Engineer",
        tags: ["node"],
        description: "React appears only in the description.",
      },
    ]);

    const result = await getStoredJobs(filters({ q: "REACT" }));

    expectMatchingIds(result, [titleMatch.id, tagMatch.id]);
  });

  it("does not match a phrase formed by joining separate tags", async () => {
    await storeJobs([
      {
        title: "Frontend Engineer",
        tags: ["react", "typescript"],
      },
    ]);

    const result = await getStoredJobs(filters({ q: "react typescript" }));

    expect(result).toEqual([]);
  });

  it("matches a company name case-insensitively and partially", async () => {
    const [matching] = await storeJobs([
      { company: "Acme Technologies" },
      { company: "Other Company" },
    ]);

    const result = await getStoredJobs(
      filters({
        company: `${companyPrefix} acme`,
      }),
    );

    expectMatchingIds(result, [matching.id]);
  });

  it("matches location or country case-insensitively", async () => {
    const [locationMatch, countryMatch] = await storeJobs([
      {
        location: "Singapore City",
        country: null,
      },
      {
        location: null,
        country: "Singapore",
      },
      {
        location: "Malaysia",
        country: "Malaysia",
      },
      {
        location: null,
        country: null,
      },
    ]);

    const result = await getStoredJobs(filters({ location: "SINGA" }));

    expectMatchingIds(result, [locationMatch.id, countryMatch.id]);
  });

  it("matches any selected source", async () => {
    const [himalayas, remoteOk] = await storeJobs([
      { source: "Himalayas" },
      { source: "Remote OK" },
      { source: "Dev Global Jobs" },
      { source: "We Work Remotely" },
    ]);

    const result = await getStoredJobs(
      filters({
        sources: ["Himalayas", "Remote OK"],
      }),
    );

    expectMatchingIds(result, [himalayas.id, remoteOk.id]);
  });

  it.each(["1", "7", "30"] as const)(
    "applies inclusive date boundaries for postedWithin=%s",
    async (postedWithin) => {
      const cutoff = dateDaysAgo(Number(postedWithin));

      const [atCutoff, atNow] = await storeJobs([
        {
          postedAt: cutoff,
        },
        {
          postedAt: NOW,
        },
        {
          postedAt: new Date(Date.parse(cutoff) - 1).toISOString(),
        },
        {
          postedAt: new Date(Date.parse(NOW) + 1).toISOString(),
        },
      ]);

      const result = await getStoredJobs(filters({ postedWithin }));

      expectMatchingIds(result, [atCutoff.id, atNow.id]);
    },
  );

  it("combines different filter groups with AND", async () => {
    const matchingJob: Partial<NewDatabaseJob> = {
      company: "Acme",
      source: "Himalayas",
      title: "Frontend Engineer",
      tags: ["react"],
      location: "Singapore",
      postedAt: dateDaysAgo(3),
    };

    const [matching] = await storeJobs([
      matchingJob,
      {
        ...matchingJob,
        source: "We Work Remotely",
      },
      {
        ...matchingJob,
        company: "Other Company",
      },
      {
        ...matchingJob,
        tags: ["node"],
      },
      {
        ...matchingJob,
        location: "Malaysia",
      },
      {
        ...matchingJob,
        postedAt: dateDaysAgo(8),
      },
      {
        ...matchingJob,
        isActive: false,
      },
    ]);

    const result = await getStoredJobs(
      filters({
        company: `${companyPrefix} Acme`,
        sources: ["Himalayas", "Remote OK"],
        q: "react",
        location: "Singapore",
        postedWithin: "7",
      }),
    );

    expectMatchingIds(result, [matching.id]);
  });

  it.each(["q", "company", "location"] as const)(
    "treats percent, underscore and backslash literally in %s",
    async (field) => {
      const literalValue = String.raw`50%_\Ops`;
      const decoyValue = "50XXOps";

      const matchingOverrides: Partial<NewDatabaseJob> = {};
      const decoyOverrides: Partial<NewDatabaseJob> = {};

      if (field === "q") {
        matchingOverrides.title = literalValue;
        decoyOverrides.title = decoyValue;
      } else if (field === "company") {
        matchingOverrides.company = literalValue;
        decoyOverrides.company = decoyValue;
      } else {
        matchingOverrides.location = literalValue;
        decoyOverrides.location = decoyValue;
      }

      const [matching] = await storeJobs([matchingOverrides, decoyOverrides]);

      const searchValue =
        field === "company" ? `${companyPrefix} ${literalValue}` : literalValue;

      const result = await getStoredJobs(filters({ [field]: searchValue }));

      expectMatchingIds(result, [matching.id]);
    },
  );

  it("does not treat SQL-looking search input as executable SQL", async () => {
    await storeJobs([
      {
        title: "Frontend Engineer",
        tags: ["react"],
      },
    ]);

    const result = await getStoredJobs(filters({ q: "' OR 1=1 --" }));

    expect(result).toEqual([]);
  });

  it("orders sources by priority and jobs newest first within each source", async () => {
    const [
      remoteOk,
      himalayasOld,
      unknownSource,
      devGlobal,
      himalayasNew,
      weWorkRemotely,
    ] = await storeJobs([
      {
        source: "Remote OK",
        postedAt: NOW,
      },
      {
        source: "Himalayas",
        postedAt: dateDaysAgo(5),
      },
      {
        source: "Another Source",
        postedAt: NOW,
      },
      {
        source: "Dev Global Jobs",
        postedAt: dateDaysAgo(1),
      },
      {
        source: "Himalayas",
        postedAt: dateDaysAgo(1),
      },
      {
        source: "We Work Remotely",
        postedAt: dateDaysAgo(2),
      },
    ]);

    const result = await getStoredJobs(filters());

    expect(result.map((job) => job.id)).toEqual([
      himalayasNew.id,
      himalayasOld.id,
      devGlobal.id,
      weWorkRemotely.id,
      remoteOk.id,
      unknownSource.id,
    ]);
  });

  it("uses ID ordering when source and posted date are equal", async () => {
    const rows = await storeJobs([
      { source: "Himalayas", postedAt: NOW },
      { source: "Himalayas", postedAt: NOW },
      { source: "Himalayas", postedAt: NOW },
    ]);

    const result = await getStoredJobs(filters());

    expect(result.map((job) => job.id)).toEqual(
      rows.map((job) => job.id).sort(),
    );
  });

  it("normalizes dates and replaces null descriptions with empty strings", async () => {
    const [stored] = await storeJobs([
      {
        postedAt: "2026-10-08T08:00:00+08:00",
        description: null,
        companyLogo: null,
        location: null,
        country: null,
        tags: [],
      },
    ]);

    const result = await getStoredJobs(filters());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: stored.id,
      postedAt: "2026-10-08T00:00:00.000Z",
      description: "",
      companyLogo: null,
      location: null,
      country: null,
      tags: [],
    });

    expect(result[0]).not.toHaveProperty("isActive");
    expect(result[0]).not.toHaveProperty("createdAt");
    expect(result[0]).not.toHaveProperty("updatedAt");
    expect(result[0]).not.toHaveProperty("lastSeenAt");
  });

  it("returns an empty array when no jobs match", async () => {
    await storeJobs([
      {
        title: "Frontend Engineer",
        tags: ["react"],
      },
    ]);

    const result = await getStoredJobs(
      filters({
        q: `no-match-${randomUUID()}`,
      }),
    );

    expect(result).toEqual([]);
  });

  it("has valid active-job search and listing-order indexes", async () => {
    const result = await db.execute(sql`
      SELECT
        index_relation.relname AS name,
        index_definition.indisvalid AS valid
      FROM pg_catalog.pg_index AS index_definition
      JOIN pg_catalog.pg_class AS index_relation
        ON index_relation.oid = index_definition.indexrelid
      JOIN pg_catalog.pg_class AS table_relation
        ON table_relation.oid = index_definition.indrelid
      JOIN pg_catalog.pg_namespace AS table_namespace
        ON table_namespace.oid = table_relation.relnamespace
      WHERE table_namespace.nspname = 'public'
        AND table_relation.relname = 'jobs'
        AND index_relation.relname IN (
          'jobs_active_title_trgm_idx',
          'jobs_active_company_trgm_idx',
          'jobs_active_location_trgm_idx',
          'jobs_active_country_trgm_idx',
          'jobs_active_tags_trgm_idx',
          'jobs_active_listing_order_idx'
        )
    `);

    expect(result.rows).toHaveLength(6);

    expect(
      result.rows.map((row) => ({
        name: row.name,
        valid: row.valid,
      })),
    ).toEqual(
      expect.arrayContaining(
        [
          "jobs_active_title_trgm_idx",
          "jobs_active_company_trgm_idx",
          "jobs_active_location_trgm_idx",
          "jobs_active_country_trgm_idx",
          "jobs_active_tags_trgm_idx",
          "jobs_active_listing_order_idx",
        ].map((name) => ({ name, valid: true })),
      ),
    );
  });

  it.each([
    ["js", ["javascript", "js"]],
    ["C++", ["C++", "systems"]],
    ["react typescript", ["react typescript"]],
    [String.raw`50%_\Ops`, [String.raw`50%_\Ops`]],
  ])(
    "preserves literal individual-tag matches for %s",
    async (keyword, tags) => {
      const [matching] = await storeJobs([
        {
          title: "Engineering position",
          tags,
        },
        {
          title: "Engineering position",
          tags: [],
        },
      ]);

      const result = await getStoredJobs(filters({ q: keyword }));

      expectMatchingIds(result, [matching.id]);
    },
  );

  it("updates indexed tag matches when tags change", async () => {
    const [stored] = await storeJobs([
      {
        title: "Engineering position",
        tags: ["react"],
      },
    ]);

    expectMatchingIds(await getStoredJobs(filters({ q: "react" })), [
      stored.id,
    ]);

    await db
      .update(jobs)
      .set({ tags: ["svelte"] })
      .where(eq(jobs.id, stored.id));

    expect(await getStoredJobs(filters({ q: "react" }))).toEqual([]);

    expectMatchingIds(await getStoredJobs(filters({ q: "svelte" })), [
      stored.id,
    ]);
  });
});
