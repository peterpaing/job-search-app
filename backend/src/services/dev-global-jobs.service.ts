import { devGlobalJobsResponseSchema } from "../schemas/dev-global-jobs.schema.js";

export async function getDevGlobalJobs() {
  const response = await fetch(
    "https://devglobaljobs.com/api/v1/jobs?limit=100&category=technology",
    {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Dev Global Jobs request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  const { jobs } = devGlobalJobsResponseSchema.parse(payload);

  const devTitlePattern =
    /\b(developer|programmer|software\s+(engineer|developer)|(?:front[\s-]?end|back[\s-]?end|full[\s-]?stack|web|mobile|ios|android|game)\s+(engineer|developer))\b/i;

  return jobs
    .filter((job) => devTitlePattern.test(job.title))
    .map((job) => {
      const location = job.location?.trim();

      return {
        id: `dev-global-jobs-${job.id}`,
        source: "Dev Global Jobs",
        title: job.title,
        company: job.organization,
        companyLogo: null,
        location: location && !/^n\/a$/i.test(location) ? location : null,
        country: job.country?.trim() || null,
        tags: job.category ? [job.category] : [],
        seniority: [],
        employmentType: job.jobType?.trim() || null,
        url: job.url,
        postedAt: job.postedAt,
      };
    });
}
