import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobs } from "../../db/schema.js";
import { importJobs } from "../../services/import-jobs.service.js";
import { getJobs } from "../../services/jobs.service.js";

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

function createJob(description?: string): SourceJob {
  return {
    id: "remote-ok-description-test",
    source: "Remote OK",
    title: "Frontend Engineer",
    company: "Example",
    companyLogo: null,
    location: null,
    tags: ["React"],
    url: "https://remoteok.com/remote-jobs/example",
    postedAt: "2026-10-08T00:00:00Z",

    ...(description !== undefined ? { description } : {}),
  };
}

beforeEach(() => {
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

describe("description importing", () => {
  it("stores source HTML as plain text", async () => {
    getJobsMock.mockResolvedValueOnce([
      createJob("<p>Build React &amp; TypeScript applications.</p>"),
    ]);

    await importJobs();

    const inserted = dbMocks.values.mock.calls[0][0][0];

    expect(inserted.description).toBe("Build React & TypeScript applications.");
  });

  it("removes script contents before storage", async () => {
    getJobsMock.mockResolvedValueOnce([
      createJob("<script>unwanted()</script>" + "<p>Frontend development.</p>"),
    ]);

    await importJobs();

    const inserted = dbMocks.values.mock.calls[0][0][0];

    expect(inserted.description).toBe("Frontend development.");
  });

  it.each([undefined, "", "   ", "<p></p>"])(
    "normalizes absent description %j to null",
    async (description) => {
      getJobsMock.mockResolvedValueOnce([createJob(description)]);

      await importJobs();

      const inserted = dbMocks.values.mock.calls[0][0][0];

      expect(inserted.description).toBeNull();
    },
  );

  it("preserves stored descriptions when the feed omits them", async () => {
    getJobsMock.mockResolvedValueOnce([createJob()]);

    await importJobs();

    const options = dbMocks.onConflictDoUpdate.mock.calls[0][0];

    const query = dialect.sqlToQuery(options.set.description);

    const normalized = query.sql.replace(/\s+/g, " ").trim();

    expect(normalized).toContain("COALESCE(");
    expect(normalized).toContain('BTRIM(excluded."description")');
    expect(normalized).toContain('"jobs"."description"');
  });

  it("keeps the existing closed-job safeguard", async () => {
    getJobsMock.mockResolvedValueOnce([createJob("<p>React developer.</p>")]);

    await importJobs();

    const options = dbMocks.onConflictDoUpdate.mock.calls[0][0];

    const query = dialect.sqlToQuery(options.set.isActive);

    expect(query.sql).toBe('"jobs"."is_active"');
    expect(options.target).toBe(jobs.id);
  });
});
