import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";
import { smartMatchProfiles } from "../db/smart-match.schema.js";
import { usageFor } from "./smart-match.budget.js";
import { profileSchema, rankJobs } from "./smart-match.logic.js";
import { FALLBACK_MATCH_DAYS } from "./smart-match.matching.js";
import { getOrCreateUser } from "./users.service.js";

export async function getSmartMatchBootstrap(clerkUserId: string) {
  const user = await getOrCreateUser(clerkUserId);
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - FALLBACK_MATCH_DAYS * 86_400_000,
  ).toISOString();

  const profilePromise = db
    .select()
    .from(smartMatchProfiles)
    .where(eq(smartMatchProfiles.userId, user.id))
    .limit(1)
    .then(([record]) => (record ? profileSchema.parse(record.profile) : null));

  const matchesPromise = profilePromise.then(async (profile) => {
    if (!profile) return { matches: [], searched: 0 };
    const records = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.isActive, true),
          gte(jobs.postedAt, cutoff),
          lte(jobs.postedAt, now.toISOString()),
        ),
      )
      .orderBy(desc(jobs.postedAt), desc(jobs.id))
      .limit(500);
    return {
      matches: rankJobs(profile, records, now).map((match) => ({
        job: {
          id: match.job.id,
          source: match.job.source,
          title: match.job.title,
          company: match.job.company,
          companyLogo: match.job.companyLogo,
          description: "",
          location: match.job.location,
          tags: match.job.tags,
          url: match.job.url,
          postedAt: match.job.postedAt,
        },
        matchedSkills: match.matchedSkills,
        strength: match.strength,
        workMode: match.workMode,
      })),
      searched: records.length,
    };
  });

  // Observe all promises immediately; no usage or profile cache is retained.
  const [profile, usage, result] = await Promise.all([
    profilePromise,
    usageFor(user.id),
    matchesPromise,
  ]);
  return { profile, usage, ...result };
}
