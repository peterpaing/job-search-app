import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const db = new PGlite();

const defaultLimits = {
  dailyRequests: 20,
  monthlyRequests: 100,
  dailyTokens: 50_000,
  monthlyTokens: 500_000,
  userMonthlyMicro: 500_000,
  globalDailyMicro: 5_000_000,
  globalMonthlyMicro: 150_000_000,
};

type Limits = Partial<typeof defaultLimits>;

type Alert = {
  threshold: number;
  event: string;
  period_kind: string;
  period_start: string;
};

type BudgetResult = {
  status: string;
  alerts?: Alert[];
};

type UsageRow = {
  scope: string;
  period_kind: string;
  period_start: string;
  requests: string | number;
  committed_tokens: string | number;
  input_tokens: string | number;
  cached_tokens: string | number;
  output_tokens: string | number;
  measured_micro: string | number;
  committed_micro: string | number;
  unresolved_requests: string | number;
};

const profile = {
  skills: ["React"],
  roles: ["Frontend Engineer"],
  experience: "junior",
  location: "",
  workMode: "any",
};

async function loadMigration(name: string) {
  const contents = await readFile(
    new URL(`../../../drizzle/${name}`, import.meta.url),
    "utf8",
  );

  await db.exec(contents);
}

async function createUser() {
  const result = await db.query<{ id: string }>(
    `
      INSERT INTO users (clerk_user_id)
      VALUES ($1)
      RETURNING id
    `,
    [`cost-test-${randomUUID()}`],
  );

  return result.rows[0]!.id;
}

async function reserve(
  userId: string,
  limits: Limits = {},
  tokens = 4200,
  micro = 3120,
) {
  const result = await db.query<{
    result: BudgetResult;
  }>(
    `
      SELECT smart_match_reserve_costs(
        $1::uuid,
        gen_random_uuid(),
        'answer',
        'gpt-4.1-mini-2025-04-14',
        'test-pricing',
        $2::bigint,
        $3::bigint,
        $4::jsonb
      ) AS result
    `,
    [
      userId,
      tokens,
      micro,
      JSON.stringify({
        ...defaultLimits,
        ...limits,
      }),
    ],
  );

  return result.rows[0]!.result;
}

async function leaseFor(userId: string) {
  const result = await db.query<{
    lease_id: string;
  }>(
    `
      SELECT lease_id
      FROM smart_match_locks
      WHERE user_id = $1::uuid
    `,
    [userId],
  );

  return result.rows[0]!.lease_id;
}

async function unlock(userId: string) {
  await db.query(
    `
      DELETE FROM smart_match_locks
      WHERE user_id = $1::uuid
    `,
    [userId],
  );
}

async function settle(
  leaseId: string,
  input: number | null = 3000,
  cached: number | null = 2000,
  output: number | null = 600,
  cost: number | null = 1560,
) {
  const result = await db.query<{
    result: BudgetResult;
  }>(
    `
      SELECT smart_match_settle_costs(
        $1::uuid,
        $2::bigint,
        $3::bigint,
        $4::bigint,
        $5::bigint
      ) AS result
    `,
    [leaseId, input, cached, output, cost],
  );

  return result.rows[0]!.result;
}

async function userUsage(userId: string, period: "day" | "month" = "month") {
  const result = await db.query<UsageRow>(
    `
      SELECT *
      FROM smart_match_cost_usage
      WHERE scope = $1
        AND period_kind = $2
      ORDER BY period_start
    `,
    [`user:${userId}`, period],
  );

  return result.rows[0]!;
}

async function attemptCount(userId: string) {
  const result = await db.query<{
    count: string | number;
  }>(
    `
      SELECT COUNT(*) AS count
      FROM smart_match_cost_requests
      WHERE user_scope = $1
    `,
    [`user:${userId}`],
  );

  return Number(result.rows[0]!.count);
}

async function storedProfile(userId: string, value: typeof profile | null) {
  const result = await db.query<{
    stored: boolean;
  }>(
    `
      SELECT smart_match_store_profile(
        $1::uuid,
        $2::jsonb
      ) AS stored
    `,
    [userId, value === null ? null : JSON.stringify(value)],
  );

  return result.rows[0]!.stored;
}

describe("SmartMatch database cost controls", () => {
  beforeAll(async () => {
    // Local, disposable database only.
    // No DATABASE_URL or TEST_DATABASE_URL is read.
    const earlierMigrations = [
      "0000_next_jimmy_woo.sql",
      "0001_flawless_robin_chapel.sql",
      "0002_cute_magik.sql",
      "0003_wealthy_sasquatch.sql",
      "0004_far_harry_osborn.sql",
      "0005_smart-match-guards.sql",
    ];

    for (const migration of earlierMigrations) {
      await loadMigration(migration);
    }

    // Historical fixture to verify the new migration backfill.
    await db.exec(`
      INSERT INTO smart_match_usage (
        scope,
        day,
        requests,
        reserved_cents
      )
      VALUES (
        'legacy-test',
        (now() AT TIME ZONE 'UTC')::date,
        3,
        30
      );
    `);

    await loadMigration("0006_smart-match-cost-controls.sql");
  }, 60_000);

  beforeEach(async () => {
    await db.exec("BEGIN");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK");
  });

  afterAll(async () => {
    await db.close();
  });

  it("preserves historical counts without claiming measured historical costs", async () => {
    const result = await db.query<UsageRow>(
      `
        SELECT *
        FROM smart_match_cost_usage
        WHERE scope = 'legacy-test'
      `,
    );

    expect(result.rows).toHaveLength(2);

    for (const row of result.rows) {
      expect(Number(row.requests)).toBe(3);
      expect(Number(row.committed_micro)).toBe(300_000);
      expect(Number(row.measured_micro)).toBe(0);
      expect(Number(row.unresolved_requests)).toBe(3);
    }
  });

  it("blocks the third new request when the monthly limit is two", async () => {
    const userId = await createUser();
    const limits = {
      monthlyRequests: 2,
    };

    for (let index = 0; index < 2; index += 1) {
      expect((await reserve(userId, limits)).status).toBe("ok");

      await settle(await leaseFor(userId));
      await unlock(userId);
    }

    expect((await reserve(userId, limits)).status).toBe("monthly_limit");

    expect(Number((await userUsage(userId)).requests)).toBe(2);

    expect(await attemptCount(userId)).toBe(2);
  });

  it("blocks the third request when the daily limit is two", async () => {
    const userId = await createUser();
    const limits = {
      dailyRequests: 2,
    };

    for (let index = 0; index < 2; index += 1) {
      expect((await reserve(userId, limits)).status).toBe("ok");

      await settle(await leaseFor(userId));
      await unlock(userId);
    }

    expect((await reserve(userId, limits)).status).toBe("daily_limit");

    expect(Number((await userUsage(userId, "day")).requests)).toBe(2);

    expect(await attemptCount(userId)).toBe(2);
  });

  const deniedCases: [Limits, string][] = [
    [{ dailyTokens: 4000 }, "daily_tokens"],
    [{ monthlyTokens: 4000 }, "monthly_tokens"],
    [{ userMonthlyMicro: 3000 }, "user_budget"],
    [{ globalDailyMicro: 3000 }, "daily_budget"],
    [{ globalMonthlyMicro: 3000 }, "monthly_budget"],
    [{ monthlyRequests: 0 }, "disabled"],
  ];

  it.each(deniedCases)(
    "rejects %j as %s before recording an AI attempt",
    async (limits, expectedStatus) => {
      const userId = await createUser();

      expect((await reserve(userId, limits)).status).toBe(expectedStatus);

      expect(await attemptCount(userId)).toBe(0);

      const locks = await db.query(
        `
          SELECT *
          FROM smart_match_locks
          WHERE user_id = $1::uuid
        `,
        [userId],
      );

      expect(locks.rows).toHaveLength(0);
    },
  );

  it("includes active reservations in the shared budget", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();

    const limits = {
      globalDailyMicro: 4000,
    };

    expect((await reserve(firstUser, limits)).status).toBe("ok");

    // First request has not settled. Its reservation must still count.
    expect((await reserve(secondUser, limits)).status).toBe("daily_budget");

    expect(await attemptCount(secondUser)).toBe(0);
  });

  it("stores measured input, cached input, output, and cost", async () => {
    const userId = await createUser();

    await reserve(userId);
    const leaseId = await leaseFor(userId);

    expect((await settle(leaseId)).status).toBe("ok");

    const row = await userUsage(userId);

    expect(Number(row.input_tokens)).toBe(3000);
    expect(Number(row.cached_tokens)).toBe(2000);
    expect(Number(row.output_tokens)).toBe(600);

    expect(Number(row.committed_tokens)).toBe(3600);
    expect(Number(row.measured_micro)).toBe(1560);
    expect(Number(row.committed_micro)).toBe(1560);
    expect(Number(row.unresolved_requests)).toBe(0);

    const request = await db.query<{
      status: string;
      input_tokens: string | number;
      cached_tokens: string | number;
      output_tokens: string | number;
      cost_micro: string | number;
    }>(
      `
        SELECT *
        FROM smart_match_cost_requests
        WHERE lease_id = $1::uuid
      `,
      [leaseId],
    );

    expect(request.rows[0]!.status).toBe("known");
    expect(Number(request.rows[0]!.cost_micro)).toBe(1560);
  });

  it("cannot settle the same request twice", async () => {
    const userId = await createUser();

    await reserve(userId);
    const leaseId = await leaseFor(userId);

    await settle(leaseId);
    const first = await userUsage(userId);

    await settle(leaseId);

    expect(await userUsage(userId)).toEqual(first);
    expect(Number(first.requests)).toBe(1);
  });

  it("keeps unknown failed requests reserved rather than zero-cost", async () => {
    const userId = await createUser();

    await reserve(userId);
    const leaseId = await leaseFor(userId);

    await settle(leaseId, null, null, null, null);

    const row = await userUsage(userId);

    expect(Number(row.requests)).toBe(1);
    expect(Number(row.committed_tokens)).toBe(4200);
    expect(Number(row.committed_micro)).toBe(3120);
    expect(Number(row.measured_micro)).toBe(0);
    expect(Number(row.unresolved_requests)).toBe(1);

    const result = await db.query<{
      status: string;
      input_tokens: null;
      cost_micro: null;
    }>(
      `
        SELECT status, input_tokens, cost_micro
        FROM smart_match_cost_requests
        WHERE lease_id = $1::uuid
      `,
      [leaseId],
    );

    expect(result.rows[0]).toEqual({
      status: "unknown",
      input_tokens: null,
      cost_micro: null,
    });
  });

  it("can reconcile previously unknown usage later", async () => {
    const userId = await createUser();

    await reserve(userId);
    const leaseId = await leaseFor(userId);

    await settle(leaseId, null, null, null, null);
    await settle(leaseId);

    const row = await userUsage(userId);

    expect(Number(row.committed_micro)).toBe(1560);
    expect(Number(row.measured_micro)).toBe(1560);
    expect(Number(row.unresolved_requests)).toBe(0);
    expect(Number(row.requests)).toBe(1);
  });

  it("allows only one active request per user", async () => {
    const userId = await createUser();

    expect((await reserve(userId)).status).toBe("ok");
    expect((await reserve(userId)).status).toBe("busy");

    expect(await attemptCount(userId)).toBe(1);
  });

  it("keeps personal monthly limits separate between accounts", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();

    const limits = {
      monthlyRequests: 1,
    };

    await reserve(firstUser, limits);
    await settle(await leaseFor(firstUser));
    await unlock(firstUser);

    expect((await reserve(firstUser, limits)).status).toBe("monthly_limit");

    expect((await reserve(secondUser, limits)).status).toBe("ok");

    expect(Number((await userUsage(firstUser)).requests)).toBe(1);

    expect(Number((await userUsage(secondUser)).requests)).toBe(1);
  });

  it("persists an 80-percent alert only once per period", async () => {
    const firstUser = await createUser();

    await reserve(firstUser, {
      globalDailyMicro: 4000,
    });

    await settle(await leaseFor(firstUser), 3000, 0, 600, 2160);

    const secondUser = await createUser();

    const result = await reserve(
      secondUser,
      {
        globalDailyMicro: 4000,
      },
      1200,
      1100,
    );

    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period_kind: "day",
          threshold: 80,
          event: "budget_threshold",
        }),
      ]),
    );

    const leaseId = await leaseFor(secondUser);

    await settle(leaseId, null, null, null, null);
    await settle(leaseId, null, null, null, null);

    const alerts = await db.query(
      `
        SELECT *
        FROM smart_match_spend_alerts
        WHERE period_kind = 'day'
          AND threshold = 80
      `,
    );

    expect(alerts.rows).toHaveLength(1);
  });

  it("records a blocked-budget alert without duplicating it", async () => {
    const userId = await createUser();

    const first = await reserve(userId, {
      globalDailyMicro: 3000,
    });

    expect(first.status).toBe("daily_budget");

    expect(first.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threshold: 100,
          event: "budget_blocked",
        }),
      ]),
    );

    const second = await reserve(userId, {
      globalDailyMicro: 3000,
    });

    expect(second.status).toBe("daily_budget");
    expect(second.alerts).toEqual([]);

    const alerts = await db.query(
      `
        SELECT *
        FROM smart_match_spend_alerts
        WHERE period_kind = 'day'
          AND threshold = 100
      `,
    );

    expect(alerts.rows).toHaveLength(1);
  });

  it("does not overbook the shared budget for parallel submissions", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();

    const limits = {
      globalDailyMicro: 4000,
    };

    const results = await Promise.all([
      reserve(firstUser, limits),
      reserve(secondUser, limits),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "daily_budget",
      "ok",
    ]);
  });

  it("settles the original periods after a day/month rollover", async () => {
    const userId = await createUser();

    await reserve(userId, {
      globalDailyMicro: 4000,
    });

    const leaseId = await leaseFor(userId);
    const scope = `user:${userId}`;

    // Simulate a request that started in an earlier month.
    await db.query(
      `
        UPDATE smart_match_cost_requests
        SET
          day = '2000-01-31',
          month = '2000-01-01'
        WHERE lease_id = $1::uuid
      `,
      [leaseId],
    );

    await db.query(
      `
        UPDATE smart_match_cost_usage
        SET period_start =
          CASE
            WHEN period_kind = 'day'
            THEN '2000-01-31'::date
            ELSE '2000-01-01'::date
          END
        WHERE scope IN ($1, 'global')
      `,
      [scope],
    );

    // New current-month allowance must not receive the old request's cost.
    await db.query(
      `
        INSERT INTO smart_match_cost_usage (
          scope,
          period_kind,
          period_start
        )
        VALUES (
          $1,
          'month',
          date_trunc(
            'month',
            now() AT TIME ZONE 'UTC'
          )::date
        )
      `,
      [scope],
    );

    const result = await settle(leaseId, 6000, 0, 1200, 5000);

    const rows = await db.query<{
      period_start: string;
      committed_micro: string | number;
    }>(
      `
        SELECT
          period_start::text,
          committed_micro
        FROM smart_match_cost_usage
        WHERE scope = $1
          AND period_kind = 'month'
        ORDER BY period_start
      `,
      [scope],
    );

    expect(Number(rows.rows[0]!.committed_micro)).toBe(5000);

    expect(Number(rows.rows[1]!.committed_micro)).toBe(0);

    expect(
      result.alerts?.map((alert) => alert.threshold).sort((a, b) => a - b),
    ).toEqual([80, 100]);
  });

  it("blocks profile deletion while an AI request is active", async () => {
    const userId = await createUser();

    expect(await storedProfile(userId, profile)).toBe(true);

    await reserve(userId);

    expect(await storedProfile(userId, null)).toBe(false);

    const profiles = await db.query(
      `
        SELECT *
        FROM smart_match_profiles
        WHERE user_id = $1::uuid
      `,
      [userId],
    );

    expect(profiles.rows).toHaveLength(1);
  });

  it("deleting a profile removes its cache but does not reset usage or other job data", async () => {
    const userId = await createUser();
    const jobId = `cost-test-job-${randomUUID()}`;

    await storedProfile(userId, profile);

    await db.query(
      `
        INSERT INTO jobs (
          id,
          source,
          title,
          company,
          url,
          posted_at
        )
        VALUES (
          $1,
          'Test',
          'Frontend Engineer',
          'Example',
          'https://example.com/job',
          now()
        )
      `,
      [jobId],
    );

    await db.query(
      `
        INSERT INTO saved_jobs (user_id, job_id)
        VALUES ($1::uuid, $2)
      `,
      [userId, jobId],
    );

    await db.query(
      `
        INSERT INTO applications (
          user_id,
          job_id,
          title,
          company,
          url
        )
        VALUES (
          $1::uuid,
          $2,
          'Frontend Engineer',
          'Example',
          'https://example.com/job'
        )
      `,
      [userId, jobId],
    );

    await db.query(
      `
        INSERT INTO smart_match_cache (
          user_id,
          key,
          kind,
          payload,
          expires_at
        )
        VALUES (
          $1::uuid,
          'test-cache',
          'answer',
          '{}'::jsonb,
          now() + interval '24 hours'
        )
      `,
      [userId],
    );

    await reserve(userId, {
      monthlyRequests: 1,
    });

    await settle(await leaseFor(userId));
    await unlock(userId);

    const before = await userUsage(userId);

    expect(await storedProfile(userId, null)).toBe(true);

    expect(await userUsage(userId)).toEqual(before);
    expect(await attemptCount(userId)).toBe(1);

    const profiles = await db.query(
      `
        SELECT *
        FROM smart_match_profiles
        WHERE user_id = $1::uuid
      `,
      [userId],
    );

    const cache = await db.query(
      `
        SELECT *
        FROM smart_match_cache
        WHERE user_id = $1::uuid
      `,
      [userId],
    );

    const saved = await db.query(
      `
        SELECT *
        FROM saved_jobs
        WHERE user_id = $1::uuid
      `,
      [userId],
    );

    const applications = await db.query(
      `
        SELECT *
        FROM applications
        WHERE user_id = $1::uuid
      `,
      [userId],
    );

    expect(profiles.rows).toHaveLength(0);
    expect(cache.rows).toHaveLength(0);
    expect(saved.rows).toHaveLength(1);
    expect(applications.rows).toHaveLength(1);

    expect(
      (
        await reserve(userId, {
          monthlyRequests: 1,
        })
      ).status,
    ).toBe("monthly_limit");
  });
});
