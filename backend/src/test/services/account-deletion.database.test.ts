import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// This database exists only in memory.
const db = new PGlite();

let userA: string;
let userB: string;

const clerkA = "user_delete_database_a";
const clerkB = "user_delete_database_b";

async function createUser(clerkId: string) {
  const result = await db.query<{ id: string }>(
    `INSERT INTO users(clerk_user_id)
     VALUES ($1)
     RETURNING id`,
    [clerkId],
  );

  return result.rows[0]!.id;
}

async function begin(clerkId = clerkA) {
  const result = await db.query<{
    result: { status: string; userId: string };
  }>(`SELECT account_deletion_begin($1) AS result`, [clerkId]);

  return result.rows[0]!.result;
}

async function count(table: string, id: string) {
  const allowed = new Set([
    "saved_jobs",
    "applications",
    "smart_match_profiles",
    "smart_match_cache",
    "smart_match_locks",
  ]);

  if (!allowed.has(table)) {
    throw new Error("Unexpected test table");
  }

  const result = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM ${table}
     WHERE user_id = $1::uuid`,
    [id],
  );

  return result.rows[0]!.total;
}

async function prepareFinish() {
  const owner = randomUUID();

  await db.query(
    `UPDATE account_deletions
     SET lease_owner = $2::uuid,
         lease_until = clock_timestamp() + interval '10 minutes',
         billing_stopped_at = clock_timestamp(),
         clerk_deleted_at = clock_timestamp()
     WHERE user_id = $1::uuid`,
    [userA, owner],
  );

  return owner;
}

async function finish(owner: string) {
  const result = await db.query<{ finished: boolean }>(
    `SELECT account_deletion_finish(
       $1::uuid, $2::uuid
     ) AS finished`,
    [userA, owner],
  );

  return result.rows[0]!.finished;
}

describe("account deletion database safeguards", () => {
  beforeAll(async () => {
    const names = [
      "0000_next_jimmy_woo.sql",
      "0001_flawless_robin_chapel.sql",
      "0002_cute_magik.sql",
      "0003_wealthy_sasquatch.sql",
      "0004_far_harry_osborn.sql",
      "0005_smart-match-guards.sql",
      "0006_smart-match-cost-controls.sql",
      "0007_job-availability.sql",
      "0008_premium-billing.sql",
      "0009_premium-billing-functions.sql",
      "0010_owner-access.sql",
      "0011_account-deletion.sql",
    ];

    for (const name of names) {
      await db.exec(
        await readFile(
          new URL(`../../../drizzle/${name}`, import.meta.url),
          "utf8",
        ),
      );
    }
  }, 60_000);

  beforeEach(async () => {
    await db.exec(`
      TRUNCATE users, jobs CASCADE;
      TRUNCATE smart_match_cost_usage,
               smart_match_cost_requests,
               smart_match_usage,
               billing_events;
    `);

    userA = await createUser(clerkA);
    userB = await createUser(clerkB);

    await db.exec(`
      INSERT INTO jobs(id, source, title, company, url, posted_at)
      VALUES (
        'deletion-job', 'Remote OK', 'Engineer', 'Example',
        'https://example.com/job', now()
      );
    `);

    for (const id of [userA, userB]) {
      await db.query(
        `INSERT INTO saved_jobs(user_id, job_id)
         VALUES ($1::uuid, 'deletion-job')`,
        [id],
      );

      await db.query(
        `INSERT INTO applications(
           user_id, job_id, title, company, url
         )
         VALUES (
           $1::uuid, 'deletion-job', 'Engineer', 'Example',
           'https://example.com/job'
         )`,
        [id],
      );

      await db.query(
        `INSERT INTO smart_match_profiles(user_id, profile)
         VALUES ($1::uuid, '{"skills":["React"]}'::jsonb)`,
        [id],
      );

      await db.query(
        `INSERT INTO smart_match_cache(
           user_id, key, kind, payload, expires_at
         )
         VALUES (
           $1::uuid, 'answer-test', 'answer', '{}'::jsonb,
           now() + interval '1 day'
         )`,
        [id],
      );

      await db.query(
        `INSERT INTO smart_match_locks(user_id, lease_id, expires_at)
         VALUES (
           $1::uuid, $2::uuid, now() - interval '1 minute'
         )`,
        [id, randomUUID()],
      );
    }

    await db.query(
      `INSERT INTO billing_customers(
         user_id, livemode, stripe_customer_id
       )
       VALUES ($1::uuid, false, 'cus_delete_database')`,
      [userA],
    );

    await db.exec(`
      INSERT INTO billing_subscriptions(
        stripe_subscription_id, stripe_customer_id,
        price_id, status, premium
      )
      VALUES (
        'sub_delete_database', 'cus_delete_database',
        'price_test', 'active', true
      );

      INSERT INTO smart_match_cost_usage(
        scope, period_kind, period_start,
        requests, committed_tokens, committed_micro
      )
      VALUES (
        'global', 'month', date_trunc('month', now())::date,
        3, 900, 1200
      );

      INSERT INTO billing_events(stripe_event_id, livemode)
      VALUES ('evt_retained', false);
    `);

    await db.query(
      `INSERT INTO smart_match_cost_requests(
         lease_id, user_scope, day, month, kind,
         model, price_version, reserved_tokens, reserved_micro
       )
       VALUES (
         $1::uuid, $2, current_date,
         date_trunc('month', now())::date,
         'answer', 'test-model', 'test-price', 100, 100
       )`,
      [randomUUID(), `user:${userA}`],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it("begins idempotently and immediately disables Pro", async () => {
    expect(await begin()).toEqual({
      status: "pending",
      userId: userA,
    });
    expect(await begin()).toEqual({
      status: "pending",
      userId: userA,
    });

    const markers = await db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM account_deletions`,
    );
    expect(markers.rows[0]!.total).toBe(1);

    const billing = await db.query<{
      risk_hold: boolean;
      premium: boolean;
    }>(`
      SELECT c.risk_hold, s.premium
      FROM billing_customers c
      JOIN billing_subscriptions s
        ON s.stripe_customer_id = c.stripe_customer_id
      WHERE c.stripe_customer_id = 'cus_delete_database'
    `);

    expect(billing.rows[0]).toEqual({
      risk_hold: true,
      premium: false,
    });
  });

  it("does not begin while an AI lease is active", async () => {
    await db.query(
      `UPDATE smart_match_locks
       SET expires_at = now() + interval '10 minutes'
       WHERE user_id = $1::uuid`,
      [userA],
    );

    expect((await begin()).status).toBe("busy");

    const result = await db.query(`SELECT user_id FROM account_deletions`);
    expect(result.rows).toEqual([]);
  });

  it("does not begin while a billing lease is active", async () => {
    await db.query(
      `UPDATE billing_customers
       SET sync_owner = $1::uuid,
           sync_until = now() + interval '2 minutes'
       WHERE user_id = $2::uuid`,
      [randomUUID(), userA],
    );

    expect((await begin()).status).toBe("busy");
  });

  it.each([
    `INSERT INTO saved_jobs(user_id, job_id)
     VALUES ($1::uuid, 'deletion-job')`,
    `UPDATE applications SET notes = 'new'
     WHERE user_id = $1::uuid`,
    `UPDATE smart_match_profiles SET profile = '{}'::jsonb
     WHERE user_id = $1::uuid`,
    `UPDATE smart_match_cache SET payload = '{}'::jsonb
     WHERE user_id = $1::uuid`,
    `UPDATE smart_match_locks SET lease_id = gen_random_uuid()
     WHERE user_id = $1::uuid`,
    `INSERT INTO billing_customers(
       user_id, livemode, stripe_customer_id
     )
     VALUES ($1::uuid, true, 'cus_forbidden')`,
  ])("blocks private writes after deletion: %s", async (statement) => {
    await begin();

    await expect(db.query(statement, [userA])).rejects.toThrow(
      "Account deletion has been requested",
    );
  });

  it("blocks normal billing leases but permits cleanup leases", async () => {
    await begin();

    const ordinary = await db.query<{ acquired: boolean }>(
      `SELECT account_deletion_take_billing_lock(
         'cus_delete_database', $1::uuid, false
       ) AS acquired`,
      [randomUUID()],
    );

    expect(ordinary.rows[0]!.acquired).toBe(false);

    const cleanup = await db.query<{ acquired: boolean }>(
      `SELECT account_deletion_take_billing_lock(
         'cus_delete_database', $1::uuid, true
       ) AS acquired`,
      [randomUUID()],
    );

    expect(cleanup.rows[0]!.acquired).toBe(true);
  });

  it("refuses cleanup without the required milestones", async () => {
    await begin();
    expect(await finish(randomUUID())).toBe(false);
    expect(await count("saved_jobs", userA)).toBe(1);
  });

  it("refuses a different or expired cleanup owner", async () => {
    await begin();
    const owner = await prepareFinish();

    expect(await finish(randomUUID())).toBe(false);

    await db.query(
      `UPDATE account_deletions
       SET lease_until = now() - interval '1 minute'
       WHERE user_id = $1::uuid`,
      [userA],
    );

    expect(await finish(owner)).toBe(false);
    expect(await count("saved_jobs", userA)).toBe(1);
  });

  it("removes only the requested user's private data", async () => {
    await begin();
    const owner = await prepareFinish();

    expect(await finish(owner)).toBe(true);

    for (const table of [
      "saved_jobs",
      "applications",
      "smart_match_profiles",
      "smart_match_cache",
      "smart_match_locks",
    ]) {
      expect(await count(table, userA)).toBe(0);
      expect(await count(table, userB)).toBe(1);
    }

    const identity = await db.query<{ clerk_user_id: string }>(
      `SELECT clerk_user_id FROM users WHERE id = $1::uuid`,
      [userA],
    );
    expect(identity.rows[0]!.clerk_user_id).toBe(`deleted:${userA}`);

    const marker = await db.query<{
      clerk_user_id: string | null;
      completed: boolean;
    }>(
      `SELECT clerk_user_id, completed_at IS NOT NULL AS completed
       FROM account_deletions
       WHERE user_id = $1::uuid`,
      [userA],
    );
    expect(marker.rows[0]).toEqual({
      clerk_user_id: null,
      completed: true,
    });
  });

  it("retains billing references and AI accounting", async () => {
    await begin();
    await finish(await prepareFinish());

    const billing = await db.query(
      `SELECT stripe_customer_id FROM billing_customers
       WHERE user_id = $1::uuid`,
      [userA],
    );
    expect(billing.rows).toHaveLength(1);

    const subscriptions = await db.query(
      `SELECT stripe_subscription_id FROM billing_subscriptions`,
    );
    expect(subscriptions.rows).toHaveLength(1);

    const reservations = await db.query(
      `SELECT lease_id FROM smart_match_cost_requests
       WHERE user_scope = $1`,
      [`user:${userA}`],
    );
    expect(reservations.rows).toHaveLength(1);

    const usage = await db.query<{ committed_micro: string | number }>(
      `SELECT committed_micro FROM smart_match_cost_usage
       WHERE scope = 'global'`,
    );
    expect(Number(usage.rows[0]!.committed_micro)).toBe(1200);

    expect(
      (await db.query(`SELECT stripe_event_id FROM billing_events`)).rows,
    ).toHaveLength(1);
  });

  it("prevents an old identity from recreating the account", async () => {
    await begin();
    await finish(await prepareFinish());

    await expect(
      db.query(`INSERT INTO users(clerk_user_id) VALUES ($1)`, [clerkA]),
    ).rejects.toThrow("Account deletion has been requested");

    expect((await begin()).status).toBe("completed");
  });

  it("allows a new, unrelated identity", async () => {
    await begin();
    await finish(await prepareFinish());

    await expect(createUser("user_new_unrelated_identity")).resolves.toMatch(
      /^[a-f0-9-]{36}$/,
    );
  });

  it("treats repeated final cleanup as completed", async () => {
    await begin();
    const owner = await prepareFinish();

    expect(await finish(owner)).toBe(true);
    expect(await finish(owner)).toBe(true);
  });
});
