import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../app.js";
import { getJobs } from "../../services/jobs.service.js";

vi.mock("../../services/jobs.service.js", () => ({
  getJobs: vi.fn(),
}));

const getJobsMock = vi.mocked(getJobs);

const job = {
  id: "remote-ok-123",
  source: "Remote OK",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  location: "Singapore",
  tags: ["react", "typescript"],
  url: "https://remoteok.com/remote-jobs/example-123",
  postedAt: "2026-10-07T00:00:00Z",
};

describe("GET /api/jobs", () => {
  beforeEach(() => {
    getJobsMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns jobs and their total", async () => {
    getJobsMock.mockResolvedValueOnce([job]);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body).toEqual({
      jobs: [job],
      total: 1,
    });
    expect(getJobsMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when no jobs are found", async () => {
    getJobsMock.mockResolvedValueOnce([]);

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

    getJobsMock.mockResolvedValueOnce([job, secondJob]);

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(200);
    expect(response.body.jobs).toEqual([job, secondJob]);
    expect(response.body.total).toBe(2);
  });

  it("returns 502 when the jobs service fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getJobsMock.mockRejectedValueOnce(new Error("Remote OK unavailable"));

    const response = await request(app).get("/api/jobs");

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      message: "Unable to fetch jobs. Please try again later.",
    });
    expect(response.body).not.toHaveProperty("jobs");
  });

  it("returns 404 for an unknown route", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(getJobsMock).not.toHaveBeenCalled();
  });
});
