import { createHash } from "node:crypto";
import { z } from "zod";
import type { DatabaseJob } from "../db/schema.js";
import { rankMatchingJobs } from "./smart-match.matching.js";

export { getJobWorkMode, type JobWorkMode } from "./smart-match.matching.js";

export const AI_MODEL = "gpt-4.1-mini-2025-04-14";
export const PROMPT_VERSION = "smart-match-v1";
export const RESERVATION_CENTS = 10;

export const profileSchema = z
  .object({
    skills: z.array(z.string().trim().min(1).max(60)).min(1).max(20),

    roles: z.array(z.string().trim().min(1).max(80)).max(5),

    experience: z.enum(["not-specified", "junior", "mid", "senior"]),

    location: z.string().trim().max(100),

    workMode: z.enum(["any", "remote", "hybrid", "on-site"]),
  })
  .strict();

export const extractedProfileSchema = profileSchema.extend({
  skills: z.array(z.string().trim().min(1).max(60)).max(20),
});

export type MatchProfile = z.infer<typeof profileSchema>;

export class SmartMatchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SmartMatchError";
  }
}

function readLimit(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);

  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new SmartMatchError(503, "SmartMatch configuration needs attention.");
  }

  return value;
}

export function getSmartMatchConfig() {
  const premiumUsers = new Set(
    (process.env.SMARTMATCH_PREMIUM_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return {
    premiumUsers,

    enabled:
      process.env.SMARTMATCH_AI_ENABLED === "true" &&
      Boolean(process.env.OPENAI_API_KEY?.trim()),

    userDailyLimit: readLimit("SMARTMATCH_USER_DAILY_LIMIT", 20),

    dailyBudgetCents: readLimit("SMARTMATCH_DAILY_BUDGET_CENTS", 500),
  };
}

export function normalizeQuestion(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function cacheKey(
  userId: string,
  kind: "extract" | "answer",
  ...inputs: unknown[]
): string {
  return createHash("sha256")
    .update(JSON.stringify([userId, kind, AI_MODEL, PROMPT_VERSION, ...inputs]))
    .digest("hex");
}

export function plainText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rankJobs(
  profile: MatchProfile,
  records: DatabaseJob[],
  now = new Date(),
) {
  return rankMatchingJobs(profile, records, now);
}
