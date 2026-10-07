import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDevGlobalJobs } from "../../services/dev-global-jobs.service.js";

const validJob = {
  id: 123,
  title: "Frontend Engineer",
  organization: "Example",
  location: "Singapore",
  country: "SG",
  category: "technology",
  jobType: "Full-time",
  postedAt: "2026-10-08T00:00:00Z",
  url: "https://devglobaljobs.com/jobs/detail/123",
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

describe("getDevGlobalJobs", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests technology jobs with JSON headers and an abort signal", async () => {
    mockResponse({ jobs: [validJob] });

    await getDevGlobalJobs();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://devglobaljobs.com/api/v1/jobs?limit=100&category=technology",
      {
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("maps job fields into the shared response format", async () => {
    mockResponse({ jobs: [validJob] });

    await expect(getDevGlobalJobs()).resolves.toEqual([
      {
        id: "dev-global-jobs-123",
        source: "Dev Global Jobs",
        title: "Frontend Engineer",
        company: "Example",
        companyLogo: null,
        location: "Singapore",
        country: "SG",
        tags: ["technology"],
        seniority: [],
        employmentType: "Full-time",
        url: validJob.url,
        postedAt: validJob.postedAt,
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

    const jobs = await getDevGlobalJobs();

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

    await expect(getDevGlobalJobs()).resolves.toEqual([]);
  });

  it("filters unrelated jobs from a mixed response", async () => {
    mockResponse({
      jobs: [
        validJob,
        { ...validJob, id: 456, title: "Marketing Manager" },
        { ...validJob, id: 789, title: "Backend Developer" },
      ],
    });

    const jobs = await getDevGlobalJobs();

    expect(jobs.map((job) => job.id)).toEqual([
      "dev-global-jobs-123",
      "dev-global-jobs-789",
    ]);
  });

  it("trims location, country and employment type", async () => {
    mockResponse({
      jobs: [
        {
          ...validJob,
          location: "  Singapore  ",
          country: "  SG  ",
          jobType: "  Full-time  ",
        },
      ],
    });

    const [job] = await getDevGlobalJobs();

    expect(job.location).toBe("Singapore");
    expect(job.country).toBe("SG");
    expect(job.employmentType).toBe("Full-time");
  });

  it.each(["N/A", "n/a", "  N/A  ", "", "   ", null])(
    "converts an unavailable location to null: %s",
    async (location) => {
      mockResponse({
        jobs: [{ ...validJob, location }],
      });

      const [job] = await getDevGlobalJobs();

      expect(job.location).toBeNull();
    },
  );

  it.each(["", "   ", null])(
    "converts a blank or null country to null: %s",
    async (country) => {
      mockResponse({
        jobs: [{ ...validJob, country }],
      });

      const [job] = await getDevGlobalJobs();

      expect(job.country).toBeNull();
    },
  );

  it.each(["", "   ", null])(
    "converts a blank or null employment type to null: %s",
    async (jobType) => {
      mockResponse({
        jobs: [{ ...validJob, jobType }],
      });

      const [job] = await getDevGlobalJobs();

      expect(job.employmentType).toBeNull();
    },
  );

  it.each(["", null])(
    "returns no tags for an empty or null category: %s",
    async (category) => {
      mockResponse({
        jobs: [{ ...validJob, category }],
      });

      const [job] = await getDevGlobalJobs();

      expect(job.tags).toEqual([]);
    },
  );

  it("handles missing optional fields", async () => {
    mockResponse({
      jobs: [
        {
          id: validJob.id,
          title: validJob.title,
          organization: validJob.organization,
          postedAt: validJob.postedAt,
          url: validJob.url,
        },
      ],
    });

    const [job] = await getDevGlobalJobs();

    expect(job.companyLogo).toBeNull();
    expect(job.location).toBeNull();
    expect(job.country).toBeNull();
    expect(job.tags).toEqual([]);
    expect(job.seniority).toEqual([]);
    expect(job.employmentType).toBeNull();
  });

  it("returns an empty array when there are no jobs", async () => {
    mockResponse({ jobs: [] });

    await expect(getDevGlobalJobs()).resolves.toEqual([]);
  });

  it("throws when the API returns an unsuccessful status", async () => {
    mockResponse({ message: "Unavailable" }, 503);

    await expect(getDevGlobalJobs()).rejects.toThrow(
      "Dev Global Jobs request failed: 503",
    );
  });

  it("propagates network errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    await expect(getDevGlobalJobs()).rejects.toThrow("Network failure");
  });

  it("propagates timeout errors", async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException("Request timed out", "TimeoutError"),
    );

    await expect(getDevGlobalJobs()).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("rejects invalid job data", async () => {
    mockResponse({
      jobs: [{ ...validJob, id: "123" }],
    });

    await expect(getDevGlobalJobs()).rejects.toThrow();
  });

  it("rejects a response without jobs", async () => {
    mockResponse({ meta: { total: 0 } });

    await expect(getDevGlobalJobs()).rejects.toThrow();
  });

  it("rejects malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not valid JSON", { status: 200 }),
    );

    await expect(getDevGlobalJobs()).rejects.toThrow(SyntaxError);
  });
});
