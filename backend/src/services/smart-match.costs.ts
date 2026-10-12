import { z } from "zod";
import { AI_MODEL, SmartMatchError } from "./smart-match.logic.js";

// Integer micro-USD: 1 USD = 1,000,000 units.
export const MAX_OUTPUT_TOKENS = 1200;
export const PRICE_VERSION = "gpt-4.1-mini-usd-2026-10-13";

function limit(name: string, fallback: number, maximum = 1_000_000_000) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);

  if (
    raw?.trim() === "" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new SmartMatchError(503, "SmartMatch configuration needs attention.");
  }

  return value;
}

export function getCostLimits() {
  if (AI_MODEL !== "gpt-4.1-mini-2025-04-14") {
    throw new SmartMatchError(
      503,
      "Review AI pricing before changing the model.",
    );
  }

  return {
    dailyRequests: limit("SMARTMATCH_USER_DAILY_LIMIT", 20),

    monthlyRequests: limit("SMARTMATCH_USER_MONTHLY_LIMIT", 100),

    dailyTokens: limit("SMARTMATCH_USER_DAILY_TOKEN_LIMIT", 50_000),

    monthlyTokens: limit("SMARTMATCH_USER_MONTHLY_TOKEN_LIMIT", 500_000),

    userMonthlyMicro:
      limit("SMARTMATCH_USER_MONTHLY_BUDGET_CENTS", 50, 100_000) * 10_000,

    globalDailyMicro:
      limit("SMARTMATCH_DAILY_BUDGET_CENTS", 500, 100_000) * 10_000,

    globalMonthlyMicro:
      limit("SMARTMATCH_MONTHLY_BUDGET_CENTS", 15_000, 100_000) * 10_000,

    maxInputTokens: limit("SMARTMATCH_MAX_INPUT_TOKENS", 24_000, 100_000),
  };
}

const tokenCount = z.number().int().nonnegative().max(10_000_000);

export const tokenUsageSchema = z
  .object({
    input_tokens: tokenCount,

    output_tokens: tokenCount,

    input_tokens_details: z
      .object({
        cached_tokens: tokenCount,
      })
      .optional(),
  })
  .refine(
    (usage) =>
      (usage.input_tokens_details?.cached_tokens ?? 0) <= usage.input_tokens,
  );

export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export function readTokenUsage(response: unknown): TokenUsage | null {
  if (
    typeof response !== "object" ||
    response === null ||
    !("usage" in response)
  ) {
    return null;
  }

  const parsed = tokenUsageSchema.safeParse(response.usage);

  return parsed.success ? parsed.data : null;
}

export function costMicro(usage: TokenUsage) {
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;

  // GPT-4.1 mini:
  // $0.40/M uncached input
  // $0.10/M cached input
  // $1.60/M output
  //
  // Round upward to an integer micro-USD.
  return Math.ceil(
    ((usage.input_tokens - cached) * 4 + cached + usage.output_tokens * 16) /
      10,
  );
}

export function reservationFor(body: unknown) {
  // Conservative text-only estimate, NOT an exact tokenizer count.
  // Includes the input, instructions, JSON schema, and framing allowance.
  const inputTokens = Buffer.byteLength(JSON.stringify(body), "utf8") + 1024;

  if (inputTokens > getCostLimits().maxInputTokens) {
    throw new SmartMatchError(
      413,
      "This request is too large. Shorten your resume or question.",
    );
  }

  return {
    inputTokens,

    totalTokens: inputTokens + MAX_OUTPUT_TOKENS,

    micro: costMicro({
      input_tokens: inputTokens,
      output_tokens: MAX_OUTPUT_TOKENS,
    }),
  };
}

export function utcPeriods(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const month = `${day.slice(0, 7)}-01`;

  const dailyReset = new Date(now);
  dailyReset.setUTCHours(24, 0, 0, 0);

  const monthlyReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return {
    day,
    month,
    dailyReset: dailyReset.toISOString(),
    monthlyReset: monthlyReset.toISOString(),
  };
}
