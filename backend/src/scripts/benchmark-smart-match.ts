import "dotenv/config";
import { performance } from "node:perf_hooks";
import type { DatabaseJob } from "../db/schema.js";
import { rankJobs, type MatchProfile } from "../services/smart-match.logic.js";

// Synthetic, repeatable CPU benchmark; does not call AI or modify the database.
// Run: npx tsx src/scripts/benchmark-smart-match.ts
// Add --database to also measure four read-only SELECT 1 round trips.

const now = new Date("2026-10-13T12:00:00Z");
const profile: MatchProfile = {
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
  roles: ["Frontend Engineer"],
  experience: "mid",
  location: "",
  workMode: "remote",
};
const records: DatabaseJob[] = Array.from({ length: 500 }, (_, index) => ({
  id: `benchmark-${index}`,
  source: "Benchmark",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description:
    "Requirements:\nReact and TypeScript.\nNice to have:\nNode.js and PostgreSQL.\nResponsibilities:\n" +
    "Build accessible applications with React and TypeScript. Improve delivery and collaborate with the engineering team.\n".repeat(
      35,
    ),
  location: "Remote",
  country: null,
  tags: ["React", "TypeScript"],
  url: "https://example.com/job",
  postedAt: new Date(
    now.getTime() - ((index % 29) + 1) * 86_400_000,
  ).toISOString(),
  isActive: true,
  lastSeenAt: now.toISOString(),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
}));

function measure(rank: typeof rankJobs) {
  const times: number[] = [];
  let matched = 0;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const started = performance.now();
    const result = rank(profile, records, now);
    matched = result.length;
    times.push(Math.round((performance.now() - started) * 100) / 100);
  }
  const warm = times.slice(1).sort((a, b) => a - b);
  return {
    records: records.length,
    matched,
    coldMs: times[0],
    warmMedianMs: warm[1],
    samplesMs: times,
  };
}
console.log(JSON.stringify(measure(rankJobs), null, 2));

if (process.argv.includes("--database")) {
  const { db } = await import("../db/index.js");
  const { sql } = await import("drizzle-orm");
  const databaseTimes: number[] = [];
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const started = performance.now();
    await db.execute(sql`SELECT 1 AS connection_check`);
    databaseTimes.push(Math.round(performance.now() - started));
  }
  console.log(
    JSON.stringify({ readOnlyDatabaseRoundTripsMs: databaseTimes }, null, 2),
  );
}
