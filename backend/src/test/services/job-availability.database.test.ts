import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();

const JOB_ID = "remote-ok-availability-test";
const JOB_URL = "https://example.com/jobs/frontend";

async function loadMigration(name: string) {
  const contents = await readFile(
    new URL(`../../../drizzle/${name}`, import.meta.url),
    "utf8",
  );

  await db.exec(contents);
}

async function insertJob() {
  await db.query(
    `
      INSERT INTO jobs (
        id, source, title, company, url, posted_at
      )
      VALUES ($1, 'Remote OK', 'Frontend Engineer',
              'Example', $2, now())
      ON CONFLICT (id) DO UPDATE
      SET is_active = true
    `,
    [JOB_ID, JOB_URL],
  );
}

async function record(
  result: string,
  hoursAgo = 0,
  expiresAt: string | null = null,
  url = JOB_URL,
) {
  const checkedAt = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000,
  ).toISOString();

  const response = await db.query<{ result: string }>(
    `
      SELECT public.record_job_availability(
        $1::text,
        $2::text,
        $3::text,
        'test_evidence'::text,
        NULL::integer,
        $4::timestamptz,
        $5::timestamptz
      ) AS result
    `,
    [JOB_ID, url, result, checkedAt, expiresAt],
  );

  return response.rows[0]!.result;
}

async function state() {
  const response = await db.query<{
    is_active: boolean;
    closed_at: string | Date | null;
    missing_checks: number;
  }>(
    `
      SELECT j.is_active, a.closed_at, a.missing_checks
      FROM jobs j
      LEFT JOIN job_availability a ON a.job_id = j.id
      WHERE j.id = $1
    `,
    [JOB_ID],
  );

  return response.rows[0]!;
}

beforeAll(async () => {
  await loadMigration("0000_next_jimmy_woo.sql");
  await loadMigration("0007_job-availability.sql");
}, 60_000);

beforeEach(async () => {
  await db.exec("TRUNCATE TABLE jobs, job_availability");

  await insertJob();
});

afterAll(async () => {
  await db.close();
});

describe("job availability database guards", () => {
  it("hides a confirmed closed job", async () => {
    expect(await record("closed")).toBe("closed");

    expect((await state()).is_active).toBe(false);
    expect((await state()).closed_at).not.toBeNull();
  });

  it("does not close a job after one missing response", async () => {
    expect(await record("missing", 25)).toBe("unknown");
    expect((await state()).is_active).toBe(true);
  });

  it("closes after two missing checks 24 hours apart", async () => {
    await record("missing", 25);

    expect(await record("missing")).toBe("closed");
    expect((await state()).is_active).toBe(false);
  });

  it("does not count immediate retries as separate confirmations", async () => {
    await record("missing", 1);
    await record("missing");

    const result = await state();

    expect(result.is_active).toBe(true);
    expect(result.missing_checks).toBe(1);
  });

  it("resets the missing streak after an uncertain check", async () => {
    await record("missing", 49);
    await record("unknown", 25);
    await record("missing");

    expect((await state()).is_active).toBe(true);
    expect((await state()).missing_checks).toBe(1);
  });

  it("does not reopen closed jobs after an uncertain check", async () => {
    await record("closed", 1);
    await record("unknown");

    expect((await state()).is_active).toBe(false);
  });

  it("does not reset the first closure date", async () => {
    await record("closed", 1);
    const original = (await state()).closed_at;

    await record("closed");

    expect((await state()).closed_at).toEqual(original);
  });

  it("prevents feed upserts from reopening a closed job", async () => {
    await record("closed");
    await insertJob();

    expect((await state()).is_active).toBe(false);
  });

  it("keeps a tombstone after deleting the main job", async () => {
    await record("closed");

    await db.query("DELETE FROM jobs WHERE id = $1", [JOB_ID]);

    await insertJob();

    const jobs = await db.query("SELECT id FROM jobs WHERE id = $1", [JOB_ID]);

    const tombstones = await db.query(
      "SELECT job_id FROM job_availability WHERE job_id = $1",
      [JOB_ID],
    );

    expect(jobs.rows).toHaveLength(0);
    expect(tombstones.rows).toHaveLength(1);
  });

  it("allows verified reopening with a future deadline", async () => {
    await record("closed", 1);

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    expect(await record("active", 0, future)).toBe("active");

    expect((await state()).is_active).toBe(true);
    expect((await state()).closed_at).toBeNull();
  });

  it("does not reopen without verified future expiry", async () => {
    await record("closed", 1);
    await record("active");

    expect((await state()).is_active).toBe(false);
  });

  it("ignores checks for a changed URL", async () => {
    expect(
      await record("closed", 0, null, "https://example.com/different-job"),
    ).toBe("skipped");

    expect((await state()).is_active).toBe(true);
  });

  it("ignores stale checks", async () => {
    await record("unknown");

    expect(await record("closed", 1)).toBe("skipped");
    expect((await state()).is_active).toBe(true);
  });

  it("closes an expired source listing", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    expect(await record("source", 0, past)).toBe("closed");
    expect((await state()).is_active).toBe(false);
  });

  it("does not close a source listing before its deadline", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await record("source", 0, future);

    expect((await state()).is_active).toBe(true);
  });
});
