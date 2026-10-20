import { setTimeout as delay } from "node:timers/promises";
import { himalayasResponseSchema } from "../schemas/himalayas.schema.js";
import { sourceDescription } from "./job-description.logic.js";

const PAGE_SIZE = 20;
const MAX_PAGES = 20;
const PAGE_DELAY_MS = 1_100;

export async function getHimalayasJobs() {
  const jobs: ReturnType<typeof himalayasResponseSchema.parse>["jobs"] = [];
  const seenJobIds = new Set<string>();
  const seenCursors = new Set<string>();

  let cursor: string | undefined;

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const url = new URL("https://himalayas.app/jobs/api");
    url.searchParams.set("limit", String(PAGE_SIZE));

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Himalayas request failed: ${response.status}`);
    }

    const payload: unknown = await response.json();
    const page = himalayasResponseSchema.parse(payload);

    for (const job of page.jobs) {
      if (!seenJobIds.has(job.guid)) {
        seenJobIds.add(job.guid);
        jobs.push(job);
      }
    }

    if (!page.nextCursor) {
      break;
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error("Himalayas pagination returned a repeated cursor");
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;

    if (pageIndex === MAX_PAGES - 1) {
      console.warn(
        "Himalayas import reached its 20-page safety limit; additional listings were not fetched.",
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
      const expiry = job.expiryDate ? new Date(job.expiryDate * 1000) : null;

      return {
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

        ...sourceDescription(job.description),

        ...(expiry && Number.isFinite(expiry.getTime())
          ? { expiresAt: expiry.toISOString() }
          : {}),
      };
    });
}
