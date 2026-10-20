import { setTimeout as delay } from "node:timers/promises";
import { devGlobalJobsResponseSchema } from "../schemas/dev-global-jobs.schema.js";
import { sourceDescription } from "./job-description.logic.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const PAGE_DELAY_MS = 1_100;

export async function getDevGlobalJobs() {
  const jobs: ReturnType<typeof devGlobalJobsResponseSchema.parse>["jobs"] = [];
  const seenJobIds = new Set<number>();

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const url = new URL("https://devglobaljobs.com/api/v1/jobs");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("category", "technology");

    if (pageIndex > 0) {
      url.searchParams.set("offset", String(pageIndex * PAGE_SIZE));
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Dev Global Jobs request failed: ${response.status}`);
    }

    const payload: unknown = await response.json();
    const page = devGlobalJobsResponseSchema.parse(payload);

    let addedJobs = 0;

    for (const job of page.jobs) {
      if (!seenJobIds.has(job.id)) {
        seenJobIds.add(job.id);
        jobs.push(job);
        addedJobs += 1;
      }
    }

    if (page.jobs.length < PAGE_SIZE) {
      break;
    }

    if (addedJobs === 0) {
      throw new Error("Dev Global Jobs pagination made no progress");
    }

    if (pageIndex === MAX_PAGES - 1) {
      console.warn(
        "Dev Global Jobs import reached its 10-page safety limit; additional listings may remain.",
      );
      break;
    }

    await delay(PAGE_DELAY_MS);
  }

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

        ...sourceDescription(job.description),
      };
    });
}
