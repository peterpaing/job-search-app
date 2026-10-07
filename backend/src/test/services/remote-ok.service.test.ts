import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRemoteOkJobs } from "../../services/remote-ok.service.js";

const metadata = {
  last_updated: 1791417600,
  legal: "API terms",
};

const validJob = {
  id: "123",
  position: "Frontend Engineer",
  company: "Example",
  company_logo: "https://example.com/logo.png",
  location: "Singapore",
  tags: ["react", "typescript"],
  url: "https://remoteok.com/remote-jobs/example-123",
  date: "2026-10-08T00:00:00Z",
};

const fetchMock = vi.fn<typeof fetch>();

function mockResponse(payload: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("getRemoteOkJobs", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests Remote OK with JSON headers and an abort signal", async () => {
    mockResponse([metadata, validJob]);

    await getRemoteOkJobs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://remoteok.com/api", {
      headers: { Accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
  });

  it("removes metadata and maps job fields", async () => {
    mockResponse([metadata, validJob]);

    await expect(getRemoteOkJobs()).resolves.toEqual([
      {
        id: "remote-ok-123",
        source: "Remote OK",
        title: "Frontend Engineer",
        company: "Example",
        companyLogo: "https://example.com/logo.png",
        location: "Singapore",
        tags: ["react", "typescript"],
        url: validJob.url,
        postedAt: validJob.date,
      },
    ]);
  });

  it.each([
    "Frontend Engineer",
    "Backend Developer",
    "Full-stack Engineer",
    "Software Engineer",
    "Senior .NET Software Engineer",
    "Mobile Developer",
    "iOS Engineer",
    "Android Developer",
    "Game Developer",
    "Programmer",
    "FRONTEND ENGINEER",
  ])("includes developer title: %s", async (position) => {
    mockResponse([metadata, { ...validJob, position }]);

    const jobs = await getRemoteOkJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe(position);
  });

  it.each([
    "Marketing Manager",
    "Sales Representative",
    "Customer Support Specialist",
    "Graphic Designer",
    "Mechanical Engineer",
  ])("excludes unrelated title: %s", async (position) => {
    mockResponse([metadata, { ...validJob, position }]);

    await expect(getRemoteOkJobs()).resolves.toEqual([]);
  });

  it("does not include unrelated roles based on tags alone", async () => {
    mockResponse([
      metadata,
      {
        ...validJob,
        position: "Marketing Manager",
        tags: ["developer", "react"],
      },
    ]);

    await expect(getRemoteOkJobs()).resolves.toEqual([]);
  });

  it("filters unrelated jobs from a mixed response", async () => {
    mockResponse([
      metadata,
      validJob,
      { ...validJob, id: "456", position: "Marketing Manager" },
      { ...validJob, id: "789", position: "Backend Developer" },
    ]);

    const jobs = await getRemoteOkJobs();

    expect(jobs.map((job) => job.id)).toEqual([
      "remote-ok-123",
      "remote-ok-789",
    ]);
  });

  it("trims the location and company logo", async () => {
    mockResponse([
      metadata,
      {
        ...validJob,
        location: "  Singapore  ",
        company_logo: "  https://example.com/logo.png  ",
      },
    ]);

    const [job] = await getRemoteOkJobs();

    expect(job.location).toBe("Singapore");
    expect(job.companyLogo).toBe("https://example.com/logo.png");
  });

  it("converts blank location and logo strings to null", async () => {
    mockResponse([
      metadata,
      {
        ...validJob,
        location: "   ",
        company_logo: "",
      },
    ]);

    const [job] = await getRemoteOkJobs();

    expect(job.location).toBeNull();
    expect(job.companyLogo).toBeNull();
  });

  it("handles missing optional fields", async () => {
    mockResponse([
      metadata,
      {
        id: validJob.id,
        position: validJob.position,
        company: validJob.company,
        url: validJob.url,
        date: validJob.date,
      },
    ]);

    const [job] = await getRemoteOkJobs();

    expect(job.location).toBeNull();
    expect(job.companyLogo).toBeNull();
    expect(job.tags).toEqual([]);
  });

  it("keeps all tags in the backend response", async () => {
    const tags = ["react", "typescript", "frontend", "javascript", "css"];

    mockResponse([metadata, { ...validJob, tags }]);

    const [job] = await getRemoteOkJobs();

    expect(job.tags).toEqual(tags);
  });

  it("returns no jobs for a metadata-only response", async () => {
    mockResponse([metadata]);

    await expect(getRemoteOkJobs()).resolves.toEqual([]);
  });

  it("returns no jobs for an empty response", async () => {
    mockResponse([]);

    await expect(getRemoteOkJobs()).resolves.toEqual([]);
  });

  it("throws when the API returns an unsuccessful status", async () => {
    mockResponse({ message: "Unavailable" }, 503);

    await expect(getRemoteOkJobs()).rejects.toThrow(
      "Remote OK request failed: 503",
    );
  });

  it("propagates network errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    await expect(getRemoteOkJobs()).rejects.toThrow("Network failure");
  });

  it("propagates timeout errors", async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException("Request timed out", "TimeoutError"),
    );

    await expect(getRemoteOkJobs()).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("rejects invalid job data", async () => {
    mockResponse([metadata, { ...validJob, id: 123 }]);

    await expect(getRemoteOkJobs()).rejects.toThrow();
  });

  it("rejects a response that is not an array", async () => {
    mockResponse({ jobs: [validJob] });

    await expect(getRemoteOkJobs()).rejects.toThrow();
  });

  it("rejects malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not valid JSON", { status: 200 }),
    );

    await expect(getRemoteOkJobs()).rejects.toThrow(SyntaxError);
  });
});
