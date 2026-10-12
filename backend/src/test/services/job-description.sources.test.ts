import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDevGlobalJobs } from "../../services/dev-global-jobs.service.js";
import { getHimalayasJobs } from "../../services/himalayas.service.js";
import { getRemoteOkJobs } from "../../services/remote-ok.service.js";
import { getWeWorkRemotelyJobs } from "../../services/we-work-remotely.service.js";

const fetchMock = vi.fn<typeof fetch>();

const DESCRIPTION = "<p>Build React applications with TypeScript.</p>";

const himalayasJob = {
  guid: "https://himalayas.app/companies/example/jobs/frontend",
  title: "Frontend Engineer",
  companyName: "Example",
  applicationLink: "https://example.com/jobs/frontend",
  pubDate: 1791417600,
};

const remoteOkJob = {
  id: "123",
  position: "Frontend Engineer",
  company: "Example",
  url: "https://remoteok.com/remote-jobs/example-123",
  date: "2026-10-08T00:00:00Z",
};

const devGlobalJob = {
  id: 123,
  title: "Frontend Engineer",
  organization: "Example",
  url: "https://example.com/jobs/frontend",
  postedAt: "2026-10-08T00:00:00Z",
};

function respondJson(payload: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );
}

function respondRss(description = "", encoded = "") {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss
      version="2.0"
      xmlns:content="http://purl.org/rss/1.0/modules/content/"
    >
      <channel>
        <title>We Work Remotely</title>
        <link>https://weworkremotely.com</link>
        <description>Programming jobs</description>
        <item>
          <title>Example: Frontend Engineer</title>
          <link>https://weworkremotely.com/remote-jobs/example</link>
          <guid isPermaLink="false">example-123</guid>
          <pubDate>Thu, 08 Oct 2026 00:00:00 GMT</pubDate>
          ${
            description
              ? `<description><![CDATA[${description}]]></description>`
              : ""
          }
          ${
            encoded
              ? `<content:encoded><![CDATA[${encoded}]]></content:encoded>`
              : ""
          }
        </item>
      </channel>
    </rss>`;

  fetchMock.mockResolvedValueOnce(
    new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml",
      },
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("source descriptions", () => {
  it("collects Himalayas descriptions", async () => {
    respondJson({
      jobs: [
        {
          ...himalayasJob,
          description: DESCRIPTION,
        },
      ],
    });

    const [job] = await getHimalayasJobs();

    expect(job?.description).toBe(DESCRIPTION);
  });

  it("retains Himalayas expiry information", async () => {
    const expiryDate = 1792281600;

    respondJson({
      jobs: [
        {
          ...himalayasJob,
          description: DESCRIPTION,
          expiryDate,
        },
      ],
    });

    const [job] = await getHimalayasJobs();

    expect(job?.expiresAt).toBe(new Date(expiryDate * 1000).toISOString());
  });

  it("collects Remote OK descriptions", async () => {
    respondJson([
      { legal: "Test metadata" },
      {
        ...remoteOkJob,
        description: DESCRIPTION,
      },
    ]);

    const [job] = await getRemoteOkJobs();

    expect(job?.description).toBe(DESCRIPTION);
  });

  it("collects Dev Global descriptions when supplied", async () => {
    respondJson({
      jobs: [
        {
          ...devGlobalJob,
          description: DESCRIPTION,
        },
      ],
    });

    const [job] = await getDevGlobalJobs();

    expect(job?.description).toBe(DESCRIPTION);
  });

  it("collects RSS description content", async () => {
    respondRss(DESCRIPTION);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job?.description).toBe(DESCRIPTION);
  });

  it("prefers encoded RSS content when available", async () => {
    const fullContent =
      "<p>Full requirements: React, TypeScript and Node.js.</p>";

    respondRss("<p>Short summary.</p>", fullContent);

    const [job] = await getWeWorkRemotelyJobs();

    expect(job?.description).toBe(fullContent);
  });

  it("allows Himalayas jobs without descriptions", async () => {
    respondJson({ jobs: [himalayasJob] });

    const [job] = await getHimalayasJobs();

    expect(job).not.toHaveProperty("description");
  });

  it("allows Remote OK jobs without descriptions", async () => {
    respondJson([{}, remoteOkJob]);

    const [job] = await getRemoteOkJobs();

    expect(job).not.toHaveProperty("description");
  });

  it("allows Dev Global jobs without descriptions", async () => {
    respondJson({ jobs: [devGlobalJob] });

    const [job] = await getDevGlobalJobs();

    expect(job).not.toHaveProperty("description");
  });

  it("allows RSS jobs without descriptions", async () => {
    respondRss();

    const [job] = await getWeWorkRemotelyJobs();

    expect(job).not.toHaveProperty("description");
  });

  it("ignores malformed optional descriptions", async () => {
    respondJson([
      {},
      {
        ...remoteOkJob,
        description: { unexpected: "object" },
      },
    ]);

    const jobs = await getRemoteOkJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).not.toHaveProperty("description");
  });
});
