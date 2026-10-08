import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../app.js";
import { getStoredJobs } from "../../services/database-jobs.service.js";

vi.mock("../../services/database-jobs.service.js", () => ({
  getStoredJobs: vi.fn(),
}));

const getStoredJobsMock = vi.mocked(getStoredJobs);

const emptyFilters = {
  q: "",
  location: "",
  company: "",
  sources: [],
  postedWithin: "",
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
    getStoredJobsMock.mockReset();
    getStoredJobsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns stored jobs and their total", async () => {
    getStoredJobsMock.mockResolvedValueOnce([job]);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body).toEqual({
      jobs: [job],
      total: 1,
    });
    expect(getStoredJobsMock).toHaveBeenCalledTimes(1);
    expect(getStoredJobsMock).toHaveBeenCalledWith(emptyFilters);
  });

  it("returns an empty array when no stored jobs are found", async () => {
    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      jobs: [],
      total: 0,
    });
  });

  it("returns the correct total for multiple jobs", async () => {
    const secondJob = {
      ...job,
      id: "remote-ok-456",
      title: "Backend Developer",
    };

    getStoredJobsMock.mockResolvedValueOnce([job, secondJob]);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toEqual([job, secondJob]);
    expect(response.body.total).toBe(2);
  });

  it("preserves the order returned by the database service", async () => {
    const himalayasJob = {
      ...job,
      id: "himalayas-123",
      source: "Himalayas",
      title: "Software Engineer",
    };

    getStoredJobsMock.mockResolvedValueOnce([himalayasJob, job]);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toEqual([himalayasJob, job]);
  });

  it("passes validated and trimmed search parameters to the service", async () => {
    const response = await request(app).get("/api/jobs").query({
      q: "  Frontend  ",
      location: "  Singapore  ",
      company: "  Example  ",
      source: "Himalayas",
      postedWithin: "7",
    });

    expect(response.status).toBe(200);
    expect(getStoredJobsMock).toHaveBeenCalledWith({
      q: "Frontend",
      location: "Singapore",
      company: "Example",
      sources: ["Himalayas"],
      postedWithin: "7",
    });
  });

  it("accepts repeated source parameters", async () => {
    const query = new URLSearchParams();

    query.append("source", "Himalayas");
    query.append("source", "Remote OK");

    const response = await request(app).get(`/api/jobs?${query.toString()}`);

    expect(response.status).toBe(200);
    expect(getStoredJobsMock).toHaveBeenCalledWith({
      ...emptyFilters,
      sources: ["Himalayas", "Remote OK"],
    });
  });

  it("deduplicates repeated sources", async () => {
    const query = new URLSearchParams();

    query.append("source", "Himalayas");
    query.append("source", "Himalayas");
    query.append("source", "Remote OK");

    const response = await request(app).get(`/api/jobs?${query.toString()}`);

    expect(response.status).toBe(200);
    expect(getStoredJobsMock).toHaveBeenCalledWith({
      ...emptyFilters,
      sources: ["Himalayas", "Remote OK"],
    });
  });

  it.each(["1", "7", "30"])("accepts postedWithin=%s", async (postedWithin) => {
    const response = await request(app)
      .get("/api/jobs")
      .query({ postedWithin });

    expect(response.status).toBe(200);
    expect(getStoredJobsMock).toHaveBeenCalledWith({
      ...emptyFilters,
      postedWithin,
    });
  });

  it("accepts empty search values", async () => {
    const response = await request(app).get("/api/jobs").query({
      q: "   ",
      location: "",
      company: "   ",
      postedWithin: "",
    });

    expect(response.status).toBe(200);
    expect(getStoredJobsMock).toHaveBeenCalledWith(emptyFilters);
  });

  it("preserves special characters in search values", async () => {
    const response = await request(app).get("/api/jobs").query({
      q: "C++ & React",
      company: "Example_100%",
    });

    expect(response.status).toBe(200);
    expect(getStoredJobsMock).toHaveBeenCalledWith({
      ...emptyFilters,
      q: "C++ & React",
      company: "Example_100%",
    });
  });

  it("ignores unrelated query parameters", async () => {
    const response = await request(app).get("/api/jobs").query({
      q: "Frontend",
      page: "3",
      sort: "newest",
    });

    expect(response.status).toBe(200);
    expect(getStoredJobsMock).toHaveBeenCalledWith({
      ...emptyFilters,
      q: "Frontend",
    });
  });

  it.each([
    ["source", "Unknown"],
    ["source", "himalayas"],
    ["source", ""],
    ["postedWithin", "14"],
    ["postedWithin", "-1"],
    ["postedWithin", "week"],
  ])(
    "returns 400 for invalid %s=%j without calling the service",
    async (field, value) => {
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
      expect(getStoredJobsMock).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown source among valid sources", async () => {
    const query = new URLSearchParams();

    query.append("source", "Himalayas");
    query.append("source", "Unknown");

    const response = await request(app).get(`/api/jobs?${query.toString()}`);

    expect(response.status).toBe(400);
    expect(getStoredJobsMock).not.toHaveBeenCalled();
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

    const response = await request(app).get(`/api/jobs?${query.toString()}`);

    expect(response.status).toBe(400);
    expect(getStoredJobsMock).not.toHaveBeenCalled();
  });

  it.each(["q", "location", "company"])(
    "rejects %s longer than 200 characters",
    async (field) => {
      const response = await request(app)
        .get("/api/jobs")
        .query({ [field]: "a".repeat(201) });

      expect(response.status).toBe(400);
      expect(getStoredJobsMock).not.toHaveBeenCalled();
    },
  );

  it.each(["q", "location", "company", "postedWithin"])(
    "rejects repeated %s values",
    async (field) => {
      const query = new URLSearchParams();

      query.append(field, field === "postedWithin" ? "7" : "First");
      query.append(field, field === "postedWithin" ? "30" : "Second");

      const response = await request(app).get(`/api/jobs?${query.toString()}`);

      expect(response.status).toBe(400);
      expect(getStoredJobsMock).not.toHaveBeenCalled();
    },
  );

  it("returns 500 when the database service fails", async () => {
    const error = new Error("Database unavailable");

    vi.spyOn(console, "error").mockImplementation(() => {});
    getStoredJobsMock.mockRejectedValueOnce(error);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Unable to fetch jobs. Please try again later.",
    });
    expect(response.body).not.toHaveProperty("jobs");
    expect(console.error).toHaveBeenCalledWith(
      "Failed to read stored jobs:",
      error,
    );
  });

  it("does not expose database error details in the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getStoredJobsMock.mockRejectedValueOnce(
      new Error("Sensitive database error details"),
    );

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain(
      "Sensitive database error details",
    );
  });

  it("returns 404 for an unknown route", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(getStoredJobsMock).not.toHaveBeenCalled();
  });
});
