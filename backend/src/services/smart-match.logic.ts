import { createHash } from "node:crypto";
import { z } from "zod";
import type { DatabaseJob } from "../db/schema.js";

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

function readLimit(name: string, fallback: number) {
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

export function normalizeQuestion(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function cacheKey(
  userId: string,
  kind: "extract" | "answer",
  ...inputs: unknown[]
) {
  return createHash("sha256")
    .update(JSON.stringify([userId, kind, AI_MODEL, PROMPT_VERSION, ...inputs]))
    .digest("hex");
}

export function plainText(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string) {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (!escaped) {
    return false;
  }

  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}

const skillGroups = [
  ["JavaScript", "JavaScript", "JS", "ECMAScript"],
  ["TypeScript", "TypeScript", "TS"],
  ["React", "React", "ReactJS", "React.js"],
  ["Next.js", "Next.js", "NextJS", "Next JS"],
  ["Node.js", "Node.js", "NodeJS", "Node JS"],
  ["Express", "Express", "ExpressJS", "Express.js"],
  ["Tailwind CSS", "Tailwind CSS", "TailwindCSS", "Tailwind"],
  ["HTML", "HTML", "HTML5"],
  ["CSS", "CSS", "CSS3"],
  ["PostgreSQL", "PostgreSQL", "Postgres"],
  ["MongoDB", "MongoDB", "Mongo DB"],
  ["Vue", "Vue", "VueJS", "Vue.js"],
  ["Angular", "Angular"],
  ["AWS", "AWS", "Amazon Web Services"],
  ["Git", "Git"],
  ["Docker", "Docker"],
] as const;

function skillKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

function getSkillDefinition(value: string) {
  const key = skillKey(value);

  const group = skillGroups.find((entries) =>
    entries.some((entry) => skillKey(entry) === key),
  );

  return group
    ? {
        label: group[0],
        aliases: [...group],
      }
    : {
        label: value.trim(),
        aliases: [value.trim()],
      };
}

function normalizeRole(value: string) {
  return value
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\bfront\s+end\b/g, "frontend")
    .replace(/\bback\s+end\b/g, "backend")
    .replace(/\bfull\s+stack\b/g, "fullstack")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesRole(title: string, role: string) {
  const normalizedTitle = normalizeRole(title);
  const normalizedRole = normalizeRole(role);

  for (const family of ["frontend", "backend", "fullstack"]) {
    if (containsPhrase(normalizedRole, family)) {
      return containsPhrase(normalizedTitle, family);
    }
  }

  return containsPhrase(normalizedTitle, normalizedRole);
}

export type JobWorkMode = "remote" | "hybrid" | "on-site" | "unknown";

export function getJobWorkMode(job: DatabaseJob): JobWorkMode {
  // Only use explicit listing metadata.
  // A source name or country does not prove that a job is remote.
  const metadata = [job.location ?? "", job.title, ...job.tags].join(" ");

  if (/\bhybrid\b/i.test(metadata)) {
    return "hybrid";
  }

  if (/\b(on[- ]?site|on[- ]?premises|office[- ]based)\b/i.test(metadata)) {
    return "on-site";
  }

  if (/\b(remote|work from home|fully distributed)\b/i.test(metadata)) {
    return "remote";
  }

  return "unknown";
}

export function rankJobs(profile: MatchProfile, records: DatabaseJob[]) {
  const definitions = profile.skills.map(getSkillDefinition);

  const uniqueSkills = definitions.filter(
    (definition, index, values) =>
      values.findIndex(
        (candidate) => skillKey(candidate.label) === skillKey(definition.label),
      ) === index,
  );

  return records
    .filter((job) => job.isActive)
    .map((job) => {
      const workMode = getJobWorkMode(job);

      const searchable = plainText(
        `${job.title} ${job.tags.join(" ")} ${(job.description ?? "").slice(0, 20_000)}`,
      );

      const matchedSkills = uniqueSkills
        .filter((skill) =>
          skill.aliases.some((alias) => containsPhrase(searchable, alias)),
        )
        .map((skill) => skill.label);

      const roleMatch = profile.roles.some((role) =>
        matchesRole(job.title, role),
      );

      const locationMatch =
        Boolean(profile.location) &&
        containsPhrase(job.location ?? "", profile.location);

      const preferredWorkMode =
        profile.workMode !== "any" && workMode === profile.workMode;

      const score =
        matchedSkills.length * 10 +
        (roleMatch ? 8 : 0) +
        (preferredWorkMode ? 4 : 0) +
        (locationMatch ? 2 : 0);

      const strength: "strong" | "partial" | "related" =
        matchedSkills.length === 0
          ? "related"
          : matchedSkills.length >= Math.min(3, uniqueSkills.length)
            ? "strong"
            : "partial";

      return {
        job,
        matchedSkills,
        roleMatch,
        workMode,
        strength,
        score,
      };
    })
    .filter((match) => {
      if (
        profile.workMode !== "any" &&
        match.workMode !== "unknown" &&
        match.workMode !== profile.workMode
      ) {
        return false;
      }

      // Role-only recommendations are not claimed as skill matches.
      return match.matchedSkills.length > 0 || match.roleMatch;
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.job.postedAt) - Date.parse(a.job.postedAt) ||
        a.job.id.localeCompare(b.job.id),
    )
    .slice(0, 12);
}
