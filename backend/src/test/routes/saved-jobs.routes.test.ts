import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getSavedJobs: vi.fn(),
  saveJob: vi.fn(),
  unsaveJob: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => {
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
  getAuth: mocks.getAuth,
}));

vi.mock("../../services/saved-jobs.service.js", () => ({
  getSavedJobs: mocks.getSavedJobs,
  saveJob: mocks.saveJob,
  unsaveJob: mocks.unsaveJob,
}));

import { createSavedJobsRouter } from "../../routes/saved-jobs.routes.js";

const app = express();

app.use(express.json());
app.use("/api/saved-jobs", createSavedJobsRouter("http://localhost:3000"));

const savedJob = {
  id: "job-a",
  title: "Frontend Engineer",
  savedAt: "2026-10-11T00:00:00.000Z",
};

describe("saved jobs routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: "user_verified",
    });

    mocks.getSavedJobs.mockResolvedValue([savedJob]);
    mocks.saveJob.mockResolvedValue(savedJob);
    mocks.unsaveJob.mockResolvedValue(undefined);
  });

  it.each(["get", "put", "delete"] as const)(
    "rejects signed-out %s requests without accessing the service",
    async (method) => {
      mocks.getAuth.mockReturnValue({
        isAuthenticated: false,
        userId: null,
      });

      const path =
        method === "get" ? "/api/saved-jobs" : "/api/saved-jobs/job-a";

      const response = await request(app)[method](path);

      expect(response.status).toBe(401);
      expect(mocks.getSavedJobs).not.toHaveBeenCalled();
      expect(mocks.saveJob).not.toHaveBeenCalled();
      expect(mocks.unsaveJob).not.toHaveBeenCalled();
    },
  );

  it("rejects an authenticated result without a user ID", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: null,
    });

    const response = await request(app).get("/api/saved-jobs");

    expect(response.status).toBe(401);
    expect(mocks.getSavedJobs).not.toHaveBeenCalled();
  });

  it("lists jobs using only the verified identity", async () => {
    const response = await request(app).get(
      "/api/saved-jobs?userId=user_other",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ jobs: [savedJob] });

    expect(mocks.getSavedJobs).toHaveBeenCalledWith("user_verified");

    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("saves using the verified identity, ignoring forged body fields", async () => {
    const response = await request(app).put("/api/saved-jobs/job-a").send({
      userId: "user_other",
      clerkUserId: "user_other",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ savedJob });

    expect(mocks.saveJob).toHaveBeenCalledWith("user_verified", "job-a");
  });

  it("unsaves using the verified identity", async () => {
    const response = await request(app)
      .delete("/api/saved-jobs/job-a")
      .send({ userId: "user_other" });

    expect(response.status).toBe(204);
    expect(response.text).toBe("");

    expect(mocks.unsaveJob).toHaveBeenCalledWith("user_verified", "job-a");
  });

  it.each(["put", "delete"] as const)(
    "rejects a whitespace-only job ID for %s",
    async (method) => {
      const response = await request(app)[method]("/api/saved-jobs/%20%20");

      expect(response.status).toBe(400);
      expect(mocks.saveJob).not.toHaveBeenCalled();
      expect(mocks.unsaveJob).not.toHaveBeenCalled();
    },
  );

  it("rejects an excessively long job ID", async () => {
    const response = await request(app).put(
      `/api/saved-jobs/${"a".repeat(513)}`,
    );

    expect(response.status).toBe(400);
    expect(mocks.saveJob).not.toHaveBeenCalled();
  });

  it("returns 404 when saving a missing job", async () => {
    mocks.saveJob.mockResolvedValue(null);

    const response = await request(app).put("/api/saved-jobs/missing-job");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: "Job not found",
    });
  });

  it.each([
    ["get", "getSavedJobs"],
    ["put", "saveJob"],
    ["delete", "unsaveJob"],
  ] as const)("returns a safe error when %s fails", async (method, service) => {
    mocks[service].mockRejectedValue(new Error("Private database details"));

    const path = method === "get" ? "/api/saved-jobs" : "/api/saved-jobs/job-a";

    const response = await request(app)[method](path);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Unable to update saved jobs. Please try again.",
    });

    expect(response.text).not.toContain("Private database details");
  });

  it("requests session-token authentication", async () => {
    await request(app).get("/api/saved-jobs");

    expect(mocks.getAuth).toHaveBeenCalledWith(expect.anything(), {
      acceptsToken: "session_token",
      treatPendingAsSignedOut: true,
    });
  });
});
