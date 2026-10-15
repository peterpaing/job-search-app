import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    execute: mocks.execute,
  },
}));

import {
  reserveBudget,
  settleBudget,
  usageFor,
} from "../../services/smart-match.budget.js";

const dialect = new PgDialect();

const userId = "00000000-0000-4000-8000-000000000001";
const leaseId = "00000000-0000-4000-8000-000000000002";

const reservation = {
  inputTokens: 3000,
  totalTokens: 4200,
  micro: 3120,
};

function lastQuery() {
  const call = mocks.execute.mock.calls.at(-1);

  if (!call) {
    throw new Error("Expected a database query.");
  }

  return dialect.sqlToQuery(call[0] as SQL);
}

function result(status = "ok", alerts: unknown[] = []) {
  return {
    rows: [
      {
        result: {
          status,
          alerts,
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "");
  vi.stubEnv("SMARTMATCH_USER_DAILY_LIMIT", "20");
  vi.stubEnv("SMARTMATCH_USER_MONTHLY_LIMIT", "100");
  vi.stubEnv("SMARTMATCH_USER_DAILY_TOKEN_LIMIT", "50000");
  vi.stubEnv("SMARTMATCH_USER_MONTHLY_TOKEN_LIMIT", "500000");
  vi.stubEnv("SMARTMATCH_USER_MONTHLY_BUDGET_CENTS", "50");
  vi.stubEnv("SMARTMATCH_DAILY_BUDGET_CENTS", "500");
  vi.stubEnv("SMARTMATCH_MONTHLY_BUDGET_CENTS", "15000");
  vi.stubEnv("SMARTMATCH_MAX_INPUT_TOKENS", "24000");

  mocks.execute.mockResolvedValue(result());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("SmartMatch budget reservations", () => {
  it("sends the user, lease, reservation, and limits to the database", async () => {
    await reserveBudget(userId, leaseId, "answer", reservation);

    const query = lastQuery();

    expect(query.sql).toContain("smart_match_reserve_costs_with_owner");

    expect(query.params.slice(0, 7)).toEqual([
      userId,
      leaseId,
      "answer",
      "gpt-4.1-mini-2025-04-14",
      "gpt-4.1-mini-usd-2026-10-13",
      4200,
      3120,
    ]);

    expect(JSON.parse(query.params[7] as string)).toMatchObject({
      dailyRequests: 20,
      monthlyRequests: 100,
      dailyTokens: 50_000,
      monthlyTokens: 500_000,
      userMonthlyMicro: 500_000,
      globalDailyMicro: 5_000_000,
      globalMonthlyMicro: 150_000_000,
      ownerClerkUserId: null,
    });
  });

  it.each([
    "daily_limit",
    "monthly_limit",
    "daily_tokens",
    "monthly_tokens",
    "user_budget",
    "daily_budget",
    "monthly_budget",
  ])("returns HTTP 429 for %s", async (status) => {
    mocks.execute.mockResolvedValue(result(status));

    await expect(
      reserveBudget(userId, leaseId, "answer", reservation),
    ).rejects.toMatchObject({
      name: "SmartMatchError",
      status: 429,
    });
  });

  it("returns HTTP 409 when another request is running", async () => {
    mocks.execute.mockResolvedValue(result("busy"));

    await expect(
      reserveBudget(userId, leaseId, "answer", reservation),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("returns HTTP 503 when AI usage is disabled", async () => {
    mocks.execute.mockResolvedValue(result("disabled"));

    await expect(
      reserveBudget(userId, leaseId, "answer", reservation),
    ).rejects.toMatchObject({
      status: 503,
    });
  });

  it("logs newly persisted spending alerts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const alert = {
      period_kind: "month",
      period_start: "2026-10-01",
      threshold: 80,
      event: "budget_threshold",
      committed_micro: 120_000_000,
      measured_micro: 100_000_000,
      budget_micro: 150_000_000,
    };

    mocks.execute.mockResolvedValue(result("ok", [alert]));

    await reserveBudget(userId, leaseId, "answer", reservation);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[smartmatch-spending-alert]",
      JSON.stringify(alert),
    );
  });

  it("does not log an alert when the database returns none", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await reserveBudget(userId, leaseId, "answer", reservation);

    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects a missing database result", async () => {
    mocks.execute.mockResolvedValue({
      rows: [],
    });

    await expect(
      reserveBudget(userId, leaseId, "answer", reservation),
    ).rejects.toThrow("Missing budget result");
  });

  it("passes the configured owner ID without removing global limits", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    await reserveBudget(userId, leaseId, "answer", reservation);

    const query = lastQuery();

    expect(query.sql).toContain("smart_match_reserve_costs_with_owner");

    expect(JSON.parse(query.params[7] as string)).toMatchObject({
      ownerClerkUserId: "user_owner",
      dailyRequests: 20,
      monthlyRequests: 100,
      dailyTokens: 50_000,
      monthlyTokens: 500_000,
      userMonthlyMicro: 500_000,
      globalDailyMicro: 5_000_000,
      globalMonthlyMicro: 150_000_000,
    });

    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("does not pass malformed owner configuration to the database", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "invalid-owner");

    await reserveBudget(userId, leaseId, "answer", reservation);

    expect(JSON.parse(lastQuery().params[7] as string)).toMatchObject({
      ownerClerkUserId: null,
    });
  });

  it.each(["daily_budget", "monthly_budget"])(
    "preserves %s rejection when owner access is configured",
    async (status) => {
      vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");
      mocks.execute.mockResolvedValue(result(status));

      await expect(
        reserveBudget(userId, leaseId, "answer", reservation),
      ).rejects.toMatchObject({
        status: 429,
      });
    },
  );

  it("preserves busy protection when owner access is configured", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");
    mocks.execute.mockResolvedValue(result("busy"));

    await expect(
      reserveBudget(userId, leaseId, "answer", reservation),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("SmartMatch budget settlement", () => {
  it("settles measured tokens using the cached-input discount", async () => {
    await settleBudget(leaseId, {
      input_tokens: 3000,
      output_tokens: 600,
      input_tokens_details: {
        cached_tokens: 2000,
      },
    });

    const query = lastQuery();

    expect(query.sql).toContain("smart_match_settle_costs");
    expect(query.params).toEqual([leaseId, 3000, 2000, 600, 1560]);
  });

  it("assumes uncached input when cached details are absent", async () => {
    await settleBudget(leaseId, {
      input_tokens: 3000,
      output_tokens: 600,
    });

    expect(lastQuery().params).toEqual([leaseId, 3000, 0, 600, 2160]);
  });

  it("sends null values for unknown usage, not invented zeros", async () => {
    await settleBudget(leaseId, null);

    expect(lastQuery().params).toEqual([leaseId, null, null, null, null]);
  });

  it("rejects settlement when the reservation cannot be found", async () => {
    mocks.execute.mockResolvedValue(result("missing"));

    await expect(settleBudget(leaseId, null)).rejects.toThrow(
      "Missing AI cost reservation",
    );
  });

  it("still settles usage when owner access is configured", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    await settleBudget(leaseId, {
      input_tokens: 3000,
      output_tokens: 600,
    });

    expect(lastQuery().sql).toContain("smart_match_settle_costs");
    expect(lastQuery().params).toEqual([leaseId, 3000, 0, 600, 2160]);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});

describe("SmartMatch usage summaries", () => {
  it("returns daily and monthly limits for a new user", async () => {
    mocks.execute.mockResolvedValue({
      rows: [],
    });

    const usage = await usageFor(userId);

    expect(usage).toMatchObject({
      ownerAccess: false,
      used: 0,
      limit: 20,
      remaining: 20,
      monthly: {
        used: 0,
        limit: 100,
        remaining: 100,
      },
      spending: {
        measuredUsd: 0,
        committedUsd: 0,
        monthlyLimitUsd: 0.5,
        unresolvedRequests: 0,
      },
    });

    expect(lastQuery().params).toContain(`user:${userId}`);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("handles PostgreSQL bigint strings and limits daily remaining by monthly remaining", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          period_kind: "day",
          requests: "5",
          committed_tokens: "2000",
          input_tokens: "1000",
          cached_tokens: "0",
          output_tokens: "200",
          measured_micro: "720",
          committed_micro: "900",
          unresolved_requests: "1",
        },
        {
          period_kind: "month",
          requests: "98",
          committed_tokens: "10000",
          input_tokens: "8000",
          cached_tokens: "1000",
          output_tokens: "1500",
          measured_micro: "5300",
          committed_micro: "9000",
          unresolved_requests: "1",
        },
      ],
    });

    expect(await usageFor(userId)).toMatchObject({
      ownerAccess: false,
      used: 5,
      limit: 20,
      remaining: 2,
      monthly: {
        used: 98,
        limit: 100,
        remaining: 2,
      },
      tokens: {
        daily: {
          committed: 2000,
          limit: 50_000,
        },
        monthly: {
          committed: 10000,
          limit: 500_000,
        },
        input: 8000,
        cachedInput: 1000,
        output: 1500,
      },
      spending: {
        measuredUsd: 0.0053,
        committedUsd: 0.009,
        unresolvedRequests: 1,
      },
    });
  });

  it("queries each user's own scope", async () => {
    mocks.execute.mockResolvedValue({
      rows: [],
    });

    await usageFor("user-a");
    expect(lastQuery().params).toContain("user:user-a");

    await usageFor("user-b");
    expect(lastQuery().params).toContain("user:user-b");
    expect(lastQuery().params).not.toContain("user:user-a");
  });

  it("recognizes the owner through the database user mapping", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ is_owner: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            period_kind: "month",
            requests: "150",
            committed_tokens: "600000",
            input_tokens: "500000",
            cached_tokens: "10000",
            output_tokens: "100000",
            measured_micro: "400000",
            committed_micro: "600000",
            unresolved_requests: "2",
          },
        ],
      });

    const usage = await usageFor(userId);

    expect(usage).toMatchObject({
      ownerAccess: true,
      monthly: {
        used: 150,
      },
      tokens: {
        monthly: {
          committed: 600000,
        },
      },
      spending: {
        measuredUsd: 0.4,
        committedUsd: 0.6,
        unresolvedRequests: 2,
      },
    });

    expect(mocks.execute).toHaveBeenCalledTimes(2);

    const ownerQuery = dialect.sqlToQuery(
      mocks.execute.mock.calls[0]![0] as SQL,
    );

    expect(ownerQuery.sql).toContain("clerk_user_id");
    expect(ownerQuery.params).toEqual([userId, "user_owner"]);
    expect(lastQuery().params).toContain(`user:${userId}`);
  });

  it("does not mark other database users as owners", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ is_owner: false }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const usage = await usageFor(userId);

    expect(usage.ownerAccess).toBe(false);
    expect(usage.remaining).toBe(20);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the owner lookup has no matching result", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    mocks.execute
      .mockResolvedValueOnce({
        rows: [],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    expect((await usageFor(userId)).ownerAccess).toBe(false);
  });

  it("does not invent owner access when the lookup fails", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    mocks.execute.mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(usageFor(userId)).rejects.toThrow("Database unavailable");
  });
});
