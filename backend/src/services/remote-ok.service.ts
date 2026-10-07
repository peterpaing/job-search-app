import { remoteOkResponseSchema } from "../schemas/remote-ok.schema.js";

export async function getRemoteOkJobs() {
  const response = await fetch("https://remoteok.com/api", {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Remote OK request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  const jobs = remoteOkResponseSchema.parse(payload);

  const devTitlePattern =
    /\b(developer|programmer|software\s+(engineer|developer)|(?:front[\s-]?end|back[\s-]?end|full[\s-]?stack|web|mobile|ios|android|game)\s+(engineer|developer))\b/i;

  return jobs
    .filter((job) => devTitlePattern.test(job.position))
    .map((job) => ({
      id: `remote-ok-${job.id}`,
      source: "Remote OK",
      title: job.position,
      company: job.company,
      companyLogo: job.company_logo?.trim() || null,
      location: job.location?.trim() || null,
      tags: job.tags ?? [],
      url: job.url,
      postedAt: job.date,
    }));
}
