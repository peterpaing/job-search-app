import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWeWorkRemotelyJobs } from "../../services/we-work-remotely.service.js";

const feedUrl =
  "https://weworkremotely.com/categories/remote-programming-jobs.rss";

const jobUrl =
  "https://weworkremotely.com/remote-jobs/example-frontend-engineer";

type FeedItem = {
  title: string;
  link: string;
  guid?: string;
  region?: string;
  category?: string;
  pubDate: string;
};

const validItem: FeedItem = {
  title: "Example: Frontend Engineer",
  link: jobUrl,
  guid: "example-123",
  region: "Anywhere in the World",
  category: "Front-End Programming",
  pubDate: "Thu, 08 Oct 2026 00:00:00 GMT",
};

const fetchMock = vi.fn<typeof fetch>();

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createFeed(items: FeedItem[]) {
  const entries = items
    .map(
      (item) => `
        <item>
          <title>${escapeXml(item.title)}</title>
          <link>${escapeXml(item.link)}</link>
          ${
            item.guid !== undefined
              ? `<guid isPermaLink="false">${escapeXml(item.guid)}</guid>`
              : ""
          }
          ${
            item.region !== undefined
              ? `<region>${escapeXml(item.region)}</region>`
              : ""
          }
          ${
            item.category !== undefined
              ? `<category>${escapeXml(item.category)}</category>`
              : ""
          }
          <pubDate>${escapeXml(item.pubDate)}</pubDate>
        </item>
      `,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>We Work Remotely</title>
        <link>https://weworkremotely.com</link>
        <description>Programming jobs</description>
        ${entries}
      </channel>
    </rss>`;
}

function mockFeed(items: FeedItem[]) {
  fetchMock.mockResolvedValueOnce(
    new Response(createFeed(items), {
      status: 200,
      headers: { "Content-Type": "application/rss+xml" },
    }),
  );
}

describe("getWeWorkRemotelyJobs", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the programming feed with RSS headers and an abort signal", async () => {
    mockFeed([validItem]);

    await getWeWorkRemotelyJobs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(feedUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: expect.any(AbortSignal),
    });
  });

  it("parses RSS and maps job fields", async () => {
    mockFeed([validItem]);

    await expect(getWeWorkRemotelyJobs()).resolves.toEqual([
      {
        id: "we-work-remotely-example-123",
        source: "We Work Remotely",
        title: "Frontend Engineer",
        company: "Example",
        companyLogo: null,
        location: "Anywhere in the World",
        tags: ["Front-End Programming"],
        url: jobUrl,
        postedAt: "2026-10-08T00:00:00.000Z",
      },
    ]);
  });

  it("splits only the first company/title separator", async () => {
    mockFeed([
      {
        ...validItem,
        title: "Example: Software Engineer: Platform",
      },
    ]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.company).toBe("Example");
    expect(job.title).toBe("Software Engineer: Platform");
  });

  it("uses a fallback company when the title has no separator", async () => {
    mockFeed([{ ...validItem, title: "Frontend Engineer" }]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.company).toBe("Company not specified");
    expect(job.title).toBe("Frontend Engineer");
  });

  it("trims company, title and region", async () => {
    mockFeed([
      {
        ...validItem,
        title: "  Example  :   Frontend Engineer  ",
        region: "  Europe  ",
      },
    ]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.company).toBe("Example");
    expect(job.title).toBe("Frontend Engineer");
    expect(job.location).toBe("Europe");
  });

  it("uses the job link as the ID when guid is missing", async () => {
    mockFeed([{ ...validItem, guid: undefined }]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.id).toBe(`we-work-remotely-${jobUrl}`);
  });

  it("returns null when region is missing", async () => {
    mockFeed([{ ...validItem, region: undefined }]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.location).toBeNull();
  });

  it("returns null when region is blank", async () => {
    mockFeed([{ ...validItem, region: "   " }]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.location).toBeNull();
  });

  it("returns an empty tags array when category is missing", async () => {
    mockFeed([{ ...validItem, category: undefined }]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.tags).toEqual([]);
  });

  it("returns an empty array for an empty feed", async () => {
    mockFeed([]);

    await expect(getWeWorkRemotelyJobs()).resolves.toEqual([]);
  });

  it("maps multiple feed items in their original order", async () => {
    mockFeed([
      validItem,
      {
        ...validItem,
        guid: "another-456",
        title: "Another Company: Backend Developer",
      },
    ]);

    const jobs = await getWeWorkRemotelyJobs();

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.title)).toEqual([
      "Frontend Engineer",
      "Backend Developer",
    ]);
  });

  it("decodes XML entities in company names", async () => {
    mockFeed([
      {
        ...validItem,
        title: "Example & Partners: Frontend Engineer",
      },
    ]);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job.company).toBe("Example & Partners");
  });

  it("throws when the feed returns an unsuccessful status", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Unavailable", { status: 503 }),
    );

    await expect(getWeWorkRemotelyJobs()).rejects.toThrow(
      "We Work Remotely request failed: 503",
    );
  });

  it("propagates network errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    await expect(getWeWorkRemotelyJobs()).rejects.toThrow("Network failure");
  });

  it("propagates timeout errors", async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException("Request timed out", "TimeoutError"),
    );

    await expect(getWeWorkRemotelyJobs()).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("rejects malformed XML", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<rss><channel></rss>", { status: 200 }),
    );

    await expect(getWeWorkRemotelyJobs()).rejects.toThrow();
  });

  it("rejects an invalid publication date", async () => {
    mockFeed([{ ...validItem, pubDate: "invalid-date" }]);

    await expect(getWeWorkRemotelyJobs()).rejects.toThrow();
  });

  it("rejects an invalid job URL", async () => {
    mockFeed([{ ...validItem, link: "not-a-url" }]);

    await expect(getWeWorkRemotelyJobs()).rejects.toThrow();
  });
});
