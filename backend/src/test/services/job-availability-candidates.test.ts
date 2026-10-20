import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { availabilityCandidatesQuery } from "../../services/job-availability-candidates.js";

const database = new PGlite();
const dialect = new PgDialect();

async function insertJob(
  id: string,
  active: boolean,
  checkedHoursAgo: number | null = null,
) {
  await database.query(
    `
      INSERT INTO jobs (id, url, title, company, is_active)
      VALUES ($1, $2, 'Frontend Engineer', 'Example', $3)
    `,
    [id, `https://example.com/jobs/${id}`, active],
  );

  if (checkedHoursAgo !== null) {
    const checkedAt = new Date(
      Date.now() - checkedHoursAgo * 60 * 60 * 1000,
    ).toISOString();

    await database.query(
      `
        INSERT INTO job_availability (job_id, last_checked_at)
        VALUES ($1, $2::timestamptz)
      `,
      [id, checkedAt],
    );
  }
}

async function selectedIds() {
  const query = dialect.sqlToQuery(availabilityCandidatesQuery);

  const result = await database.query<{ id: string }>(query.sql, query.params);

  return result.rows.map((row) => row.id);
}

beforeAll(async () => {
  await database.exec(`
    CREATE TABLE jobs (
      id text PRIMARY KEY,
      url text NOT NULL,
      title text NOT NULL,
      company text NOT NULL,
      is_active boolean NOT NULL
    );

    CREATE TABLE job_availability (
      job_id text PRIMARY KEY,
      last_checked_at timestamptz
    );
  `);
}, 60_000);

beforeEach(async () => {
  await database.exec("TRUNCATE TABLE jobs, job_availability");
});

afterAll(async () => {
  await database.close();
});

describe("availability candidate scheduling", () => {
  it("selects overdue active jobs but excludes recently checked jobs", async () => {
    await insertJob("active-overdue", true, 25);
    await insertJob("active-recent", true, 23);
    await insertJob("active-unchecked", true);

    expect(await selectedIds()).toEqual(["active-unchecked", "active-overdue"]);
  });

  it("rechecks inactive jobs weekly rather than daily", async () => {
    await insertJob("inactive-overdue", false, 169);
    await insertJob("inactive-recent", false, 25);
    await insertJob("inactive-unchecked", false);

    expect(await selectedIds()).toEqual([
      "inactive-unchecked",
      "inactive-overdue",
    ]);
  });

  it("places active jobs before inactive jobs", async () => {
    await insertJob("inactive-unchecked", false);
    await insertJob("active-overdue", true, 25);

    expect(await selectedIds()).toEqual([
      "active-overdue",
      "inactive-unchecked",
    ]);
  });

  it("checks never-checked active jobs first, then the oldest check", async () => {
    await insertJob("active-recently-due", true, 25);
    await insertJob("active-oldest", true, 72);
    await insertJob("active-unchecked", true);

    expect(await selectedIds()).toEqual([
      "active-unchecked",
      "active-oldest",
      "active-recently-due",
    ]);
  });

  it("uses job IDs to break equal-priority ties", async () => {
    await insertJob("job-b", true);
    await insertJob("job-a", true);

    expect(await selectedIds()).toEqual(["job-a", "job-b"]);
  });

  it("gives active and inactive jobs independent batch limits", async () => {
    await database.exec(`
      INSERT INTO jobs (id, url, title, company, is_active)
      SELECT
        'active-' || lpad(value::text, 3, '0'),
        'https://example.com/jobs/active-' || value,
        'Frontend Engineer',
        'Example',
        true
      FROM generate_series(1, 205) AS series(value);

      INSERT INTO jobs (id, url, title, company, is_active)
      SELECT
        'inactive-' || lpad(value::text, 3, '0'),
        'https://example.com/jobs/inactive-' || value,
        'Frontend Engineer',
        'Example',
        false
      FROM generate_series(1, 25) AS series(value);
    `);

    const ids = await selectedIds();

    expect(ids).toHaveLength(220);
    expect(ids.filter((id) => id.startsWith("active-"))).toHaveLength(200);
    expect(ids.filter((id) => id.startsWith("inactive-"))).toHaveLength(20);
    expect(ids[0]).toBe("active-001");
    expect(ids[199]).toBe("active-200");
    expect(ids[200]).toBe("inactive-001");
  });

  it("moves checked jobs out of the queue so the next batch progresses", async () => {
    await database.exec(`
      INSERT INTO jobs (id, url, title, company, is_active)
      SELECT
        'active-' || lpad(value::text, 3, '0'),
        'https://example.com/jobs/' || value,
        'Frontend Engineer',
        'Example',
        true
      FROM generate_series(1, 205) AS series(value);
    `);

    expect(await selectedIds()).toHaveLength(200);

    await database.exec(`
      INSERT INTO job_availability (job_id, last_checked_at)
      SELECT id, now()
      FROM jobs
      WHERE id <= 'active-200';
    `);

    expect(await selectedIds()).toEqual([
      "active-201",
      "active-202",
      "active-203",
      "active-204",
      "active-205",
    ]);
  });

  it("returns no candidates when both queues are empty", async () => {
    expect(await selectedIds()).toEqual([]);
  });
});
