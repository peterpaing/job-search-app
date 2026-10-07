import { himalayasResponseSchema } from "../schemas/himalayas.schema.js";

export async function getHimalayasJobs() {
  const response = await fetch("https://himalayas.app/jobs/api?limit=20", {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Himalayas request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  const { jobs } = himalayasResponseSchema.parse(payload);

  const devTitlePattern =
    /\b(developer|programmer|software\s+(engineer|developer)|(?:front[\s-]?end|back[\s-]?end|full[\s-]?stack|web|mobile|ios|android|game)\s+(engineer|developer))\b/i;

  return jobs
    .filter((job) => devTitlePattern.test(job.title))
    .map((job) => ({
      id: `himalayas-${job.guid}`,
      source: "Himalayas",
      title: job.title,
      company: job.companyName,
      companyLogo: job.companyLogo?.trim() || null,
      location: job.locationRestrictions?.join(", ") || null,
      tags: job.categories ?? [],
      seniority: job.seniority ?? [],
      employmentType: job.employmentType?.trim() || null,
      url: job.applicationLink,
      postedAt: new Date(job.pubDate * 1000).toISOString(),
    }));
}
