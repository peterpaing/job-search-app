import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getHimalayasJobs } from "../../services/himalayas.service.js";

const validJob = {
  guid: "https://himalayas.app/companies/example/jobs/frontend-engineer",
  title: "Frontend Engineer",
  companyName: "Example",
  companyLogo: "https://example.com/logo.png",
  locationRestrictions: ["Singapore"],
  categories: ["React", "Frontend"],
  applicationLink:
    "https://himalayas.app/companies/example/jobs/frontend-engineer",
  pubDate: 1791417600,
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

describe("getHimalayasJobs", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests Himalayas with JSON headers and an abort signal", async () => {
    mockResponse({ jobs: [validJob] });

    await getHimalayasJobs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://himalayas.app/jobs/api?limit=20",
      {
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("maps a job into the frontend response format", async () => {
    mockResponse({ jobs: [validJob] });

    await expect(getHimalayasJobs()).resolves.toEqual([
      {
        id: `himalayas-${validJob.guid}`,
        source: "Himalayas",
        title: "Frontend Engineer",
        company: "Example",
        companyLogo: "https://example.com/logo.png",
        location: "Singapore",
        tags: ["React", "Frontend"],
        url: validJob.applicationLink,
        postedAt: "2026-10-08T00:00:00.000Z",
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
  ])("includes developer title: %s", async (title) => {
    mockResponse({ jobs: [{ ...validJob, title }] });

    const jobs = await getHimalayasJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe(title);
  });

  it.each([
    "Marketing Manager",
    "Sales Representative",
    "Customer Support Specialist",
    "Product Designer",
    "Mechanical Engineer",
  ])("excludes unrelated title: %s", async (title) => {
    mockResponse({ jobs: [{ ...validJob, title }] });

    await expect(getHimalayasJobs()).resolves.toEqual([]);
  });

  it("filters unrelated jobs from a mixed response", async () => {
    const unrelatedJob = {
      ...validJob,
      guid: "https://himalayas.app/companies/example/jobs/marketing-manager",
      title: "Marketing Manager",
    };

    mockResponse({ jobs: [validJob, unrelatedJob] });

    const jobs = await getHimalayasJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Frontend Engineer");
  });

  it("does not include unrelated roles based on categories alone", async () => {
    mockResponse({
      jobs: [
        {
          ...validJob,
          title: "Marketing Manager",
          categories: ["Software-Developer", "React"],
        },
      ],
    });

    await expect(getHimalayasJobs()).resolves.toEqual([]);
  });

  it("joins multiple location restrictions", async () => {
    mockResponse({
      jobs: [
        {
          ...validJob,
          locationRestrictions: ["Singapore", "Malaysia"],
        },
      ],
    });

    const [job] = await getHimalayasJobs();

    expect(job.location).toBe("Singapore, Malaysia");
  });

  it("returns null for empty location restrictions", async () => {
    mockResponse({
      jobs: [{ ...validJob, locationRestrictions: [] }],
    });

    const [job] = await getHimalayasJobs();

    expect(job.location).toBeNull();
  });

  it("trims the company logo", async () => {
    mockResponse({
      jobs: [
        {
          ...validJob,
          companyLogo: "  https://example.com/logo.png  ",
        },
      ],
    });

    const [job] = await getHimalayasJobs();

    expect(job.companyLogo).toBe("https://example.com/logo.png");
  });

  it.each(["", "   ", null])(
    "converts an empty or null logo to null: %s",
    async (companyLogo) => {
      mockResponse({
        jobs: [{ ...validJob, companyLogo }],
      });

      const [job] = await getHimalayasJobs();

      expect(job.companyLogo).toBeNull();
    },
  );

  it("handles missing optional fields", async () => {
    mockResponse({
      jobs: [
        {
          guid: validJob.guid,
          title: validJob.title,
          companyName: validJob.companyName,
          applicationLink: validJob.applicationLink,
          pubDate: validJob.pubDate,
        },
      ],
    });

    const [job] = await getHimalayasJobs();

    expect(job.companyLogo).toBeNull();
    expect(job.location).toBeNull();
    expect(job.tags).toEqual([]);
  });

  it("returns an empty array when there are no jobs", async () => {
    mockResponse({ jobs: [] });

    await expect(getHimalayasJobs()).resolves.toEqual([]);
  });

  it("throws when the API returns an unsuccessful status", async () => {
    mockResponse({ message: "Unavailable" }, 503);

    await expect(getHimalayasJobs()).rejects.toThrow(
      "Himalayas request failed: 503",
    );
  });

  it("propagates network errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    await expect(getHimalayasJobs()).rejects.toThrow("Network failure");
  });

  it("propagates timeout errors", async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException("Request timed out", "TimeoutError"),
    );

    await expect(getHimalayasJobs()).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("rejects invalid response data", async () => {
    mockResponse({
      jobs: [{ ...validJob, pubDate: "invalid" }],
    });

    await expect(getHimalayasJobs()).rejects.toThrow();
  });

  it("rejects malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not valid JSON", { status: 200 }),
    );

    await expect(getHimalayasJobs()).rejects.toThrow(SyntaxError);
  });
});
