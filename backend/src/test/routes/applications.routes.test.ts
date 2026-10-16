import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApplicationsRouter } from "../../routes/applications.routes.js";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getApplications: vi.fn(),
  trackApplication: vi.fn(),
  updateApplication: vi.fn(),
  removeApplication: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: mocks.getAuth,
}));

vi.mock("../../services/applications.service.js", () => ({
  getApplications: mocks.getApplications,
  trackApplication: mocks.trackApplication,
  updateApplication: mocks.updateApplication,
  removeApplication: mocks.removeApplication,
}));

vi.mock("../../services/account-deletion.state.js", () => ({
  assertAccountActive: vi.fn(async () => undefined),
  AccountDeletionError: class AccountDeletionError extends Error {},
}));

const application = {
  id: "application-a",
  jobId: "job-a",
  title: "Frontend Engineer",
  company: "Example",
  url: "https://example.com/jobs/job-a",
  status: "applied",
  notes: "",
  appliedAt: "2026-10-11T01:00:00.000Z",
  updatedAt: "2026-10-11T01:00:00.000Z",
};

const app = express();
app.use(express.json());
app.use("/api/applications", createApplicationsRouter("http://localhost:3000"));

const endpoints = [
  ["get", "/api/applications"],
  ["put", "/api/applications/job-a"],
  ["patch", "/api/applications/job-a"],
  ["delete", "/api/applications/job-a"],
] as const;

describe("applications routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: "user_verified",
    });

    mocks.getApplications.mockResolvedValue([application]);
    mocks.trackApplication.mockResolvedValue(application);
    mocks.updateApplication.mockResolvedValue(application);
    mocks.removeApplication.mockResolvedValue(undefined);
  });

  it.each(endpoints)("rejects signed-out %s requests", async (method, path) => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app)[method](path).send({
      status: "applied",
    });

    expect(result.status).toBe(401);
    expect(mocks.getApplications).not.toHaveBeenCalled();
    expect(mocks.trackApplication).not.toHaveBeenCalled();
    expect(mocks.updateApplication).not.toHaveBeenCalled();
    expect(mocks.removeApplication).not.toHaveBeenCalled();
  });

  it("requires a verified user ID even when authenticated is true", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: null,
    });

    const result = await request(app).get("/api/applications");

    expect(result.status).toBe(401);
    expect(mocks.getApplications).not.toHaveBeenCalled();
  });

  it("lists applications using verified identity, not query identity", async () => {
    const result = await request(app).get(
      "/api/applications?userId=user_forged",
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      applications: [application],
    });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(mocks.getApplications).toHaveBeenCalledWith("user_verified");
  });

  it("tracks a job without trusting body identity or job details", async () => {
    const result = await request(app).put("/api/applications/job-a").send({
      userId: "user_forged",
      clerkUserId: "user_forged",
      title: "Forged title",
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ application });
    expect(mocks.trackApplication).toHaveBeenCalledWith(
      "user_verified",
      "job-a",
    );
  });

  it("updates only validated fields for the verified user", async () => {
    const result = await request(app).patch("/api/applications/job-a").send({
      status: "interviewing",
      notes: "Friday interview",
    });

    expect(result.status).toBe(200);
    expect(mocks.updateApplication).toHaveBeenCalledWith(
      "user_verified",
      "job-a",
      {
        status: "interviewing",
        notes: "Friday interview",
      },
    );
  });

  it("deletes using verified identity", async () => {
    const result = await request(app)
      .delete("/api/applications/job-a")
      .send({ userId: "user_forged" });

    expect(result.status).toBe(204);
    expect(result.text).toBe("");
    expect(mocks.removeApplication).toHaveBeenCalledWith(
      "user_verified",
      "job-a",
    );
  });

  it.each([
    {},
    { status: "invalid-status" },
    { notes: "x".repeat(5001) },
    { notes: 123 },
    { userId: "user_forged", status: "applied" },
  ])("rejects invalid updates: %j", async (body) => {
    const result = await request(app)
      .patch("/api/applications/job-a")
      .send(body);

    expect(result.status).toBe(400);
    expect(mocks.updateApplication).not.toHaveBeenCalled();
  });

  it.each(["put", "patch", "delete"] as const)(
    "rejects an empty job ID for %s",
    async (method) => {
      const result = await request(app)
        [method]("/api/applications/%20%20")
        .send({ status: "applied" });

      expect(result.status).toBe(400);
      expect(mocks.trackApplication).not.toHaveBeenCalled();
      expect(mocks.updateApplication).not.toHaveBeenCalled();
      expect(mocks.removeApplication).not.toHaveBeenCalled();
    },
  );

  it("rejects job IDs longer than the allowed limit", async () => {
    const result = await request(app).put(
      `/api/applications/${"x".repeat(513)}`,
    );

    expect(result.status).toBe(400);
    expect(mocks.trackApplication).not.toHaveBeenCalled();
  });

  it("returns 404 when the original job cannot be tracked", async () => {
    mocks.trackApplication.mockResolvedValue(null);

    const result = await request(app).put("/api/applications/missing");

    expect(result.status).toBe(404);
  });

  it("returns 404 when the user's application does not exist", async () => {
    mocks.updateApplication.mockResolvedValue(null);

    const result = await request(app)
      .patch("/api/applications/missing")
      .send({ notes: "A note" });

    expect(result.status).toBe(404);
  });

  it.each(endpoints)(
    "returns safe errors for failed %s operations",
    async (method, path) => {
      const failure = new Error("PRIVATE_DATABASE_DETAILS");

      mocks.getApplications.mockRejectedValue(failure);
      mocks.trackApplication.mockRejectedValue(failure);
      mocks.updateApplication.mockRejectedValue(failure);
      mocks.removeApplication.mockRejectedValue(failure);

      const result = await request(app)[method](path).send({
        status: "applied",
      });

      expect(result.status).toBe(500);
      expect(result.body).toEqual({
        message: "Unable to update applications. Please try again.",
      });
      expect(result.text).not.toContain("PRIVATE_DATABASE_DETAILS");
    },
  );

  it("accepts session tokens and treats pending sessions as signed out", async () => {
    await request(app).get("/api/applications");

    expect(mocks.getAuth).toHaveBeenCalledWith(expect.anything(), {
      acceptsToken: "session_token",
      treatPendingAsSignedOut: true,
    });
  });
});
