import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../app.js";
import { getStoredJobs } from "../../services/database-jobs.service.js";

vi.mock("../../services/database-jobs.service.js", () => ({
  getStoredJobs: vi.fn(),
}));

const getStoredJobsMock = vi.mocked(getStoredJobs);

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
  });

  it("returns an empty array when no stored jobs are found", async () => {
    getStoredJobsMock.mockResolvedValueOnce([]);

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

  it("returns 404 for an unknown route", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(getStoredJobsMock).not.toHaveBeenCalled();
  });
});
