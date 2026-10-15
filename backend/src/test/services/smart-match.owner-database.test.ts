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

// In-memory database only.
// No DATABASE_URL, TEST_DATABASE_URL, or API keys are read.
const db = new PGlite();

const ownerClerkId = "user_testOwner";

const defaultLimits = {
  dailyRequests: 20,
  monthlyRequests: 100,
  dailyTokens: 50_000,
  monthlyTokens: 500_000,
  userMonthlyMicro: 500_000,
  globalDailyMicro: 5_000_000,
  globalMonthlyMicro: 150_000_000,
  ownerClerkUserId: ownerClerkId as string | null,
};

type Limits = typeof defaultLimits;

type ReservationResult = {
  status: string;
};

const personalLimitCases: {
  name: string;
  limits: Partial<Limits>;
  expected: string;
}[] = [
  {
    name: "daily request limit",
    limits: { dailyRequests: 1 },
    expected: "daily_limit",
  },
  {
    name: "monthly request limit",
    limits: { monthlyRequests: 1 },
    expected: "monthly_limit",
  },
  {
    name: "daily token limit",
    limits: { dailyTokens: 4200 },
    expected: "daily_tokens",
  },
  {
    name: "monthly token limit",
    limits: { monthlyTokens: 4200 },
    expected: "monthly_tokens",
  },
  {
    name: "personal spending limit",
    limits: { userMonthlyMicro: 3120 },
    expected: "user_budget",
  },
];

async function createUser(clerkUserId: string) {
  const result = await db.query<{ id: string }>(
    `
      INSERT INTO users (clerk_user_id)
      VALUES ($1)
      RETURNING id
    `,
    [clerkUserId],
  );

  return result.rows[0]!.id;
}

async function reserve(userId: string, limits: Partial<Limits> = {}) {
  const result = await db.query<{ result: ReservationResult }>(
    `
      SELECT smart_match_reserve_costs_with_owner(
        $1::uuid,
        $2::uuid,
        'answer',
        'gpt-4.1-mini-2025-04-14',
        'owner-test-pricing',
        4200::bigint,
        3120::bigint,
        $3::jsonb
      ) AS result
    `,
    [
      userId,
      randomUUID(),
      JSON.stringify({
        ...defaultLimits,
        ...limits,
      }),
    ],
  );

  return result.rows[0]!.result;
}

async function releaseTestLock(userId: string) {
  // Only this disposable database is affected.
  // Reservations remain recorded for accounting assertions.
  await db.query(
    `
      DELETE FROM smart_match_locks
      WHERE user_id = $1::uuid
    `,
    [userId],
  );
}

async function monthlyUsage(scope: string) {
  const result = await db.query<{
    requests: string | number;
    committed_tokens: string | number;
    committed_micro: string | number;
  }>(
    `
      SELECT requests, committed_tokens, committed_micro
      FROM smart_match_cost_usage
      WHERE scope = $1
        AND period_kind = 'month'
        AND period_start = date_trunc(
          'month',
          now() AT TIME ZONE 'UTC'
        )::date
    `,
    [scope],
  );

  return result.rows[0]!;
}

describe("Owner database safeguards", () => {
  beforeAll(async () => {
    const migrations = [
      "0000_next_jimmy_woo.sql",
      "0001_flawless_robin_chapel.sql",
      "0002_cute_magik.sql",
      "0003_wealthy_sasquatch.sql",
      "0004_far_harry_osborn.sql",
      "0005_smart-match-guards.sql",
      "0006_smart-match-cost-controls.sql",
      "0010_owner-access.sql",
    ];

    for (const name of migrations) {
      const contents = await readFile(
        new URL(`../../../drizzle/${name}`, import.meta.url),
        "utf8",
      );

      await db.exec(contents);
    }
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

  it.each(personalLimitCases)(
    "keeps the normal user's $name",
    async ({ limits, expected }) => {
      const userId = await createUser(`user_normal${randomUUID()}`);

      expect((await reserve(userId, limits)).status).toBe("ok");

      await releaseTestLock(userId);

      expect((await reserve(userId, limits)).status).toBe(expected);

      const userUsage = await monthlyUsage(`user:${userId}`);
      const globalUsage = await monthlyUsage("global");

      // Rejected requests must not create another reservation.
      expect(Number(userUsage.requests)).toBe(1);
      expect(Number(globalUsage.requests)).toBe(1);
      expect(Number(userUsage.committed_micro)).toBe(3120);
    },
  );

  it.each(personalLimitCases)(
    "lets the verified owner exceed the $name",
    async ({ limits }) => {
      const userId = await createUser(ownerClerkId);

      expect((await reserve(userId, limits)).status).toBe("ok");

      await releaseTestLock(userId);

      expect((await reserve(userId, limits)).status).toBe("ok");

      const userUsage = await monthlyUsage(`user:${userId}`);
      const globalUsage = await monthlyUsage("global");

      // Owner bypass must not bypass accounting.
      expect(Number(userUsage.requests)).toBe(2);
      expect(Number(userUsage.committed_tokens)).toBe(8400);
      expect(Number(userUsage.committed_micro)).toBe(6240);

      expect(Number(globalUsage.requests)).toBe(2);
      expect(Number(globalUsage.committed_tokens)).toBe(8400);
      expect(Number(globalUsage.committed_micro)).toBe(6240);
    },
  );

  it("blocks the owner at the global daily spending budget", async () => {
    const userId = await createUser(ownerClerkId);
    const limits = { globalDailyMicro: 3120 };

    expect((await reserve(userId, limits)).status).toBe("ok");

    await releaseTestLock(userId);

    expect((await reserve(userId, limits)).status).toBe("daily_budget");

    expect(Number((await monthlyUsage("global")).requests)).toBe(1);
    expect(Number((await monthlyUsage(`user:${userId}`)).requests)).toBe(1);
  });

  it("blocks the owner at the global monthly spending budget", async () => {
    const userId = await createUser(ownerClerkId);
    const limits = { globalMonthlyMicro: 3120 };

    expect((await reserve(userId, limits)).status).toBe("ok");

    await releaseTestLock(userId);

    expect((await reserve(userId, limits)).status).toBe("monthly_budget");

    expect(Number((await monthlyUsage("global")).requests)).toBe(1);
    expect(Number((await monthlyUsage(`user:${userId}`)).requests)).toBe(1);
  });

  it("counts normal-user spending toward the owner's global budget", async () => {
    const normalId = await createUser("user_normal");
    const ownerId = await createUser(ownerClerkId);
    const limits = { globalDailyMicro: 3120 };

    expect((await reserve(normalId, limits)).status).toBe("ok");

    // Another account has consumed the shared daily budget.
    expect((await reserve(ownerId, limits)).status).toBe("daily_budget");

    expect(Number((await monthlyUsage("global")).requests)).toBe(1);
  });

  it("still blocks overlapping requests from the owner", async () => {
    const userId = await createUser(ownerClerkId);

    expect((await reserve(userId)).status).toBe("ok");

    // Keep the first request's active lease.
    expect((await reserve(userId)).status).toBe("busy");

    expect(Number((await monthlyUsage(`user:${userId}`)).requests)).toBe(1);
  });

  it("does not bypass limits when owner configuration is absent", async () => {
    const userId = await createUser(ownerClerkId);

    const limits = {
      ownerClerkUserId: null,
      dailyRequests: 1,
    };

    expect((await reserve(userId, limits)).status).toBe("ok");

    await releaseTestLock(userId);

    expect((await reserve(userId, limits)).status).toBe("daily_limit");
  });
});
