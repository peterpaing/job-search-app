import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../app.js";
import { getStoredJobsPage } from "../../services/database-jobs.service.js";

vi.mock("../../services/database-jobs.service.js", () => ({
  getStoredJobsPage: vi.fn(),
}));

const getStoredJobsPageMock = vi.mocked(getStoredJobsPage);

const emptyFilters = {
  q: "",
  location: "",
  company: "",
  sources: [],
  postedWithin: "",
};

const emptyResponse = {
  jobs: [],
  total: 0,
  page: 1,
  pageSize: 18,
  totalPages: 0,
};

const job = {
  id: "remote-ok-123",
  source: "Remote OK",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "",
  location: "Singapore",
  country: null,
  tags: ["react", "typescript"],
  url: "https://remoteok.com/remote-jobs/example-123",
  postedAt: "2026-10-07T00:00:00.000Z",
};

describe("GET /api/jobs", () => {
  beforeEach(() => {
    getStoredJobsPageMock.mockReset();
    getStoredJobsPageMock.mockResolvedValue(emptyResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns jobs, total and pagination metadata", async () => {
    const data = {
      jobs: [job],
      total: 1,
      page: 1,
      pageSize: 18,
      totalPages: 1,
    };

    getStoredJobsPageMock.mockResolvedValueOnce(data);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body).toEqual(data);
    expect(getStoredJobsPageMock).toHaveBeenCalledTimes(1);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(emptyFilters, 1);
  });

  it("returns an empty page when nothing matches", async () => {
    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(emptyResponse);
  });

  it("preserves the service total instead of using the page length", async () => {
    getStoredJobsPageMock.mockResolvedValueOnce({
      jobs: [job],
      total: 37,
      page: 3,
      pageSize: 18,
      totalPages: 3,
    });

    const response = await request(app).get("/api/jobs?page=3");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toHaveLength(1);
    expect(response.body.total).toBe(37);
    expect(response.body.page).toBe(3);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(emptyFilters, 3);
  });

  it("preserves the order returned by the service", async () => {
    const himalayasJob = {
      ...job,
      id: "himalayas-123",
      source: "Himalayas",
    };

    getStoredJobsPageMock.mockResolvedValueOnce({
      jobs: [himalayasJob, job],
      total: 2,
      page: 1,
      pageSize: 18,
      totalPages: 1,
    });

    const response = await request(app).get("/api/jobs");

    expect(response.body.jobs).toEqual([himalayasJob, job]);
  });

  it("passes trimmed filters and the requested page separately", async () => {
    const response = await request(app).get("/api/jobs").query({
      q: "  Frontend  ",
      location: "  Singapore  ",
      company: "  Example  ",
      source: "Himalayas",
      postedWithin: "7",
      page: "2",
    });

    expect(response.status).toBe(200);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(
      {
        q: "Frontend",
        location: "Singapore",
        company: "Example",
        sources: ["Himalayas"],
        postedWithin: "7",
      },
      2,
    );
  });

  it.each([
    ["Himalayas", "Remote OK"],
    ["Himalayas", "Himalayas", "Remote OK"],
  ])("accepts and deduplicates repeated sources: %j", async (...sources) => {
    const query = new URLSearchParams();

    for (const source of sources) {
      query.append("source", source);
    }

    const response = await request(app).get(`/api/jobs?${query}`);

    expect(response.status).toBe(200);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(
      {
        ...emptyFilters,
        sources: ["Himalayas", "Remote OK"],
      },
      1,
    );
  });

  it.each(["1", "7", "30"])("accepts postedWithin=%s", async (postedWithin) => {
    const response = await request(app)
      .get("/api/jobs")
      .query({ postedWithin });

    expect(response.status).toBe(200);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(
      { ...emptyFilters, postedWithin },
      1,
    );
  });

  it("accepts empty search values", async () => {
    const response = await request(app).get("/api/jobs").query({
      q: "   ",
      location: "",
      company: "   ",
      postedWithin: "",
    });

    expect(response.status).toBe(200);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(emptyFilters, 1);
  });

  it("preserves special characters in searches", async () => {
    await request(app).get("/api/jobs").query({
      q: "C++ & React",
      company: "Example_100%",
    });

    expect(getStoredJobsPageMock).toHaveBeenCalledWith(
      {
        ...emptyFilters,
        q: "C++ & React",
        company: "Example_100%",
      },
      1,
    );
  });

  it("ignores unrelated parameters but accepts page", async () => {
    const response = await request(app).get("/api/jobs").query({
      q: "Frontend",
      page: "3",
      sort: "newest",
    });

    expect(response.status).toBe(200);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(
      { ...emptyFilters, q: "Frontend" },
      3,
    );
  });

  it("returns a clamped page supplied by the service", async () => {
    getStoredJobsPageMock.mockResolvedValueOnce({
      jobs: [job],
      total: 19,
      page: 2,
      pageSize: 18,
      totalPages: 2,
    });

    const response = await request(app).get("/api/jobs?page=999");

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(2);
    expect(getStoredJobsPageMock).toHaveBeenCalledWith(emptyFilters, 999);
  });

  it.each([
    ["source", "Unknown"],
    ["source", "himalayas"],
    ["source", ""],
    ["postedWithin", "14"],
    ["postedWithin", "-1"],
    ["postedWithin", "week"],
    ["page", ""],
    ["page", "0"],
    ["page", "-1"],
    ["page", "1.5"],
    ["page", "abc"],
    ["page", "1000001"],
  ])("rejects invalid %s=%j", async (field, value) => {
    const response = await request(app)
      .get("/api/jobs")
      .query({ [field]: value });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid job search parameters.");
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field,
          message: expect.any(String),
        }),
      ]),
    );
    expect(getStoredJobsPageMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown source among valid sources", async () => {
    const query = new URLSearchParams();
    query.append("source", "Himalayas");
    query.append("source", "Unknown");

    const response = await request(app).get(`/api/jobs?${query}`);

    expect(response.status).toBe(400);
    expect(getStoredJobsPageMock).not.toHaveBeenCalled();
  });

  it("rejects more than four source entries", async () => {
    const query = new URLSearchParams();

    for (const source of [
      "Himalayas",
      "Remote OK",
      "We Work Remotely",
      "Dev Global Jobs",
      "Himalayas",
    ]) {
      query.append("source", source);
    }

    const response = await request(app).get(`/api/jobs?${query}`);

    expect(response.status).toBe(400);
    expect(getStoredJobsPageMock).not.toHaveBeenCalled();
  });

  it.each(["q", "location", "company"])(
    "rejects oversized %s values",
    async (field) => {
      const response = await request(app)
        .get("/api/jobs")
        .query({ [field]: "a".repeat(201) });

      expect(response.status).toBe(400);
      expect(getStoredJobsPageMock).not.toHaveBeenCalled();
    },
  );

  it.each(["q", "location", "company", "postedWithin", "page"])(
    "rejects repeated %s values",
    async (field) => {
      const query = new URLSearchParams();
      query.append(field, "1");
      query.append(field, "7");

      const response = await request(app).get(`/api/jobs?${query}`);

      expect(response.status).toBe(400);
      expect(getStoredJobsPageMock).not.toHaveBeenCalled();
    },
  );

  it("returns a friendly 500 response and logs service errors", async () => {
    const error = new Error("Database unavailable");
    vi.spyOn(console, "error").mockImplementation(() => {});
    getStoredJobsPageMock.mockRejectedValueOnce(error);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Unable to fetch jobs. Please try again later.",
    });
    expect(console.error).toHaveBeenCalledWith(
      "Failed to read stored jobs:",
      error,
    );
  });

  it("does not expose database error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getStoredJobsPageMock.mockRejectedValueOnce(
      new Error("Sensitive database details"),
    );

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain(
      "Sensitive database details",
    );
  });

  it("returns 404 for unknown routes", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(getStoredJobsPageMock).not.toHaveBeenCalled();
  });
});
