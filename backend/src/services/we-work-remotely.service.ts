import Parser from "rss-parser";
import { weWorkRemotelyResponseSchema } from "../schemas/we-work-remotely.schema.js";

const parser = new Parser({
  customFields: {
    item: ["region"],
  },
});

export async function getWeWorkRemotelyJobs() {
  const response = await fetch(
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`We Work Remotely request failed: ${response.status}`);
  }

  const xml = await response.text();
  const payload = await parser.parseString(xml);
  const { items } = weWorkRemotelyResponseSchema.parse(payload);

  return items.map((job) => {
    // Feed titles use "Company: Job title".
    const separatorIndex = job.title.indexOf(": ");

    const company =
      separatorIndex >= 0
        ? job.title.slice(0, separatorIndex).trim()
        : "Company not specified";

    const title =
      separatorIndex >= 0
        ? job.title.slice(separatorIndex + 2).trim()
        : job.title;

    return {
      id: `we-work-remotely-${job.guid || job.link}`,
      source: "We Work Remotely",
      title,
      company,
      companyLogo: null,
      location: job.region?.trim() || null,
      tags: job.categories ?? [],
      url: job.link,
      postedAt: new Date(job.pubDate).toISOString(),
    };
  });
}
