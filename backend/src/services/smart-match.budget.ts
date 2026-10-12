import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { AI_MODEL, SmartMatchError } from "./smart-match.logic.js";
import {
  costMicro,
  getCostLimits,
  PRICE_VERSION,
  utcPeriods,
  type TokenUsage,
  type reservationFor,
} from "./smart-match.costs.js";

const resultSchema = z.object({
  status: z.string(),

  alerts: z
    .array(
      z.object({
        period_kind: z.string(),
        period_start: z.string(),
        threshold: z.number(),
        event: z.string(),
        committed_micro: z.number(),
        measured_micro: z.number(),
        budget_micro: z.number(),
      }),
    )
    .default([]),
});

function resultFrom(rows: unknown) {
  const parsed = z.array(z.object({ result: resultSchema })).parse(rows);

  if (!parsed[0]) {
    throw new Error("Missing budget result");
  }

  for (const alert of parsed[0].result.alerts) {
    // Durable copies are also in smart_match_spend_alerts.
    // Never log prompts, resume text, or user IDs.
    console.warn("[smartmatch-spending-alert]", JSON.stringify(alert));
  }

  return parsed[0].result;
}

export async function reserveBudget(
  userId: string,
  leaseId: string,
  kind: "extract" | "answer",
  reservation: ReturnType<typeof reservationFor>,
) {
  const limits = getCostLimits();

  const response = await db.execute(sql`
    SELECT smart_match_reserve_costs(
      ${userId}::uuid,
      ${leaseId}::uuid,
      ${kind},
      ${AI_MODEL},
      ${PRICE_VERSION},
      ${reservation.totalTokens}::bigint,
      ${reservation.micro}::bigint,
      ${JSON.stringify(limits)}::jsonb
    ) AS result
  `);

  const result = resultFrom(response.rows);

  if (result.status === "ok") {
    return;
  }

  const messages: Record<string, string> = {
    busy: "You already have an AI request running. Please wait.",

    disabled: "AI is temporarily unavailable.",

    daily_limit:
      "You’ve reached your daily AI limit. It resets at midnight UTC.",

    monthly_limit:
      "You’ve reached your monthly AI limit. It resets on the first of next month (UTC).",

    daily_tokens:
      "You’ve reached your daily AI token allowance. Try again tomorrow.",

    monthly_tokens:
      "You’ve reached your monthly AI token allowance. Try again next month.",

    user_budget:
      "You’ve reached your monthly AI spending allowance. Try again next month.",

    daily_budget: "AI has reached today’s service budget. Try again tomorrow.",

    monthly_budget:
      "AI has reached this month’s service budget. Please try again next month.",
  };

  throw new SmartMatchError(
    result.status === "busy" ? 409 : result.status === "disabled" ? 503 : 429,

    messages[result.status] ?? "AI is temporarily unavailable.",
  );
}

export async function settleBudget(leaseId: string, usage: TokenUsage | null) {
  const response = await db.execute(sql`
    SELECT smart_match_settle_costs(
      ${leaseId}::uuid,
      ${usage?.input_tokens ?? null}::bigint,
      ${
        usage?.input_tokens_details?.cached_tokens ?? (usage ? 0 : null)
      }::bigint,
      ${usage?.output_tokens ?? null}::bigint,
      ${usage ? costMicro(usage) : null}::bigint
    ) AS result
  `);

  const result = resultFrom(response.rows);

  if (result.status !== "ok") {
    throw new Error("Missing AI cost reservation");
  }
}

const counter = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const usageRow = z.object({
  period_kind: z.enum(["day", "month"]),
  requests: counter,
  committed_tokens: counter,
  input_tokens: counter,
  cached_tokens: counter,
  output_tokens: counter,
  measured_micro: counter,
  committed_micro: counter,
  unresolved_requests: counter,
});

export async function usageFor(userId: string) {
  const periods = utcPeriods();
  const limits = getCostLimits();

  const result = await db.execute(sql`
    SELECT
      period_kind,
      requests,
      committed_tokens,
      input_tokens,
      cached_tokens,
      output_tokens,
      measured_micro,
      committed_micro,
      unresolved_requests
    FROM smart_match_cost_usage
    WHERE scope = ${`user:${userId}`}
      AND (
        (
          period_kind = 'day'
          AND period_start = ${periods.day}::date
        )
        OR (
          period_kind = 'month'
          AND period_start = ${periods.month}::date
        )
      )
  `);

  const rows = z.array(usageRow).parse(result.rows);

  const day = rows.find((row) => row.period_kind === "day");

  const month = rows.find((row) => row.period_kind === "month");

  const monthlyUsed = month?.requests ?? 0;

  return {
    // Existing frontend fields remain compatible.
    used: day?.requests ?? 0,
    limit: limits.dailyRequests,

    remaining: Math.max(
      0,
      Math.min(
        limits.dailyRequests - (day?.requests ?? 0),
        limits.monthlyRequests - monthlyUsed,
      ),
    ),

    resetsAt: periods.dailyReset,

    monthly: {
      used: monthlyUsed,
      limit: limits.monthlyRequests,
      remaining: Math.max(0, limits.monthlyRequests - monthlyUsed),
      resetsAt: periods.monthlyReset,
    },

    tokens: {
      daily: {
        committed: day?.committed_tokens ?? 0,
        limit: limits.dailyTokens,
      },

      monthly: {
        committed: month?.committed_tokens ?? 0,
        limit: limits.monthlyTokens,
      },

      input: month?.input_tokens ?? 0,
      cachedInput: month?.cached_tokens ?? 0,
      output: month?.output_tokens ?? 0,
    },

    spending: {
      measuredUsd: (month?.measured_micro ?? 0) / 1_000_000,

      committedUsd: (month?.committed_micro ?? 0) / 1_000_000,

      monthlyLimitUsd: limits.userMonthlyMicro / 1_000_000,

      unresolvedRequests: month?.unresolved_requests ?? 0,
    },
  };
}
