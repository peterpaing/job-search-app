import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSmartMatchRouter } from "../../routes/smart-match.routes.js";
import { SmartMatchError } from "../../services/smart-match.logic.js";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getState: vi.fn(),
  storeProfile: vi.fn(),
  getJobs: vi.fn(),
  extract: vi.fn(),
  answer: vi.fn(),
  bootstrap: vi.fn(),
  hasPremium: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: mocks.getAuth,
}));

vi.mock("../../services/billing.service.js", () => ({
  hasPremium: mocks.hasPremium,
}));

vi.mock("../../services/smart-match.service.js", () => ({
  getSmartMatchState: mocks.getState,
  storeSmartMatchProfile: mocks.storeProfile,
  getSmartMatchJobs: mocks.getJobs,
  extractSmartMatchProfile: mocks.extract,
  answerSmartMatchQuestion: mocks.answer,
}));

vi.mock("../../services/smart-match-bootstrap.service.js", () => ({
  getSmartMatchBootstrap: mocks.bootstrap,
}));

const app = express();
app.use(express.json());
app.use("/api/smart-match", createSmartMatchRouter("http://localhost:3000"));

const profile = {
  skills: ["React"],
  roles: ["Frontend Engineer"],
  experience: "mid",
  location: "",
  workMode: "any",
};

const endpoints = [
  ["get", "/profile"],
  ["put", "/profile"],
  ["delete", "/profile"],
  ["get", "/matches"],
  ["post", "/extract"],
  ["post", "/ask"],
] as const;

describe("SmartMatch routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "");
    vi.stubEnv("SMARTMATCH_AI_ENABLED", "false");
    vi.stubEnv("SMARTMATCH_USER_DAILY_LIMIT", "20");
    vi.stubEnv("SMARTMATCH_DAILY_BUDGET_CENTS", "500");

    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: "user_verified",
    });

    mocks.hasPremium.mockImplementation(
      async (clerkUserId: string) => clerkUserId === "user_verified",
    );

    mocks.getState.mockResolvedValue({
      profile: null,
      usage: { used: 0, limit: 20, remaining: 20 },
    });

    mocks.storeProfile.mockResolvedValue({ profile });
    mocks.getJobs.mockResolvedValue({ matches: [], searched: 0 });

    mocks.bootstrap.mockResolvedValue({
      profile,
      usage: {},
      matches: [],
      searched: 0,
    });

    mocks.extract.mockResolvedValue({ draft: profile });

    mocks.answer.mockResolvedValue({
      answer: "Review the React requirements.",
      cached: false,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated access checks", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app).get("/api/smart-match/access");

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("requires a verified user ID", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: null,
    });

    const result = await request(app).get("/api/smart-match/profile");

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
    expect(mocks.getState).not.toHaveBeenCalled();
  });

  it("returns backend-owned premium access", async () => {
    const result = await request(app).get(
      "/api/smart-match/access?premium=false&userId=forged",
    );

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(true);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(result.headers["cache-control"]).toBe("no-store");
  });

  it("bootstraps only the verified identity, never a query-supplied user", async () => {
    const result = await request(app).get(
      "/api/smart-match/bootstrap?userId=forged&premium=true",
    );

    expect(result.status).toBe(200);
    expect(result.body.access.premium).toBe(true);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(mocks.bootstrap).toHaveBeenCalledWith("user_verified");
    expect(result.headers["cache-control"]).toBe("no-store");
  });

  it("does not read private bootstrap data for a non-premium user", async () => {
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get(
      "/api/smart-match/bootstrap?premium=true",
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      access: { premium: false },
      profile: null,
      usage: null,
      matches: [],
      searched: 0,
    });
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("requires authentication before bootstrap", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app).get("/api/smart-match/bootstrap");

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it.each(endpoints)("blocks non-premium %s %s", async (method, path) => {
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app)
      [method](`/api/smart-match${path}`)
      .send(profile);

    expect(result.status).toBe(403);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(mocks.getState).not.toHaveBeenCalled();
    expect(mocks.storeProfile).not.toHaveBeenCalled();
    expect(mocks.getJobs).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("reads profiles using verified identity", async () => {
    const result = await request(app).get(
      "/api/smart-match/profile?userId=forged",
    );

    expect(result.status).toBe(200);
    expect(mocks.getState).toHaveBeenCalledWith("user_verified");
  });

  it("saves a validated profile", async () => {
    const result = await request(app)
      .put("/api/smart-match/profile")
      .send(profile);

    expect(result.status).toBe(200);
    expect(mocks.storeProfile).toHaveBeenCalledWith("user_verified", profile);
  });

  it("rejects forged identity fields in a profile", async () => {
    const result = await request(app)
      .put("/api/smart-match/profile")
      .send({ ...profile, userId: "forged", premium: true });

    expect(result.status).toBe(400);
    expect(mocks.storeProfile).not.toHaveBeenCalled();
  });

  it("requires consent before resume extraction", async () => {
    const result = await request(app)
      .post("/api/smart-match/extract")
      .send({ resumeText: "React developer experience. ".repeat(5) });

    expect(result.status).toBe(400);
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("rejects oversized questions before calling AI", async () => {
    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "x".repeat(601) });

    expect(result.status).toBe(400);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("uses verified identity for AI questions", async () => {
    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "Explain my fit." });

    expect(result.status).toBe(200);
    expect(mocks.answer).toHaveBeenCalledWith(
      "user_verified",
      "job-a",
      "Explain my fit.",
    );
  });

  it("returns quota errors without turning them into generic failures", async () => {
    mocks.answer.mockRejectedValue(
      new SmartMatchError(429, "Daily AI limit reached."),
    );

    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "Explain my fit." });

    expect(result.status).toBe(429);
    expect(result.body.message).toBe("Daily AI limit reached.");
  });

  it("deletes only the authenticated user's SmartMatch data", async () => {
    const result = await request(app).delete(
      "/api/smart-match/profile?userId=forged",
    );

    expect(result.status).toBe(200);
    expect(mocks.storeProfile).toHaveBeenCalledWith("user_verified", null);
  });

  it("does not expose internal error details", async () => {
    mocks.getState.mockRejectedValue(
      new Error("Internal database credentials"),
    );

    const result = await request(app).get("/api/smart-match/profile");

    expect(result.status).toBe(500);
    expect(result.body.message).not.toContain("credentials");
  });

  it("grants the verified owner access without paid billing", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/access");

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(true);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("allows the owner to bootstrap without paid billing", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/bootstrap");

    expect(result.status).toBe(200);
    expect(result.body.access.premium).toBe(true);
    expect(mocks.bootstrap).toHaveBeenCalledWith("user_verified");
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("allows the owner through the protected profile middleware", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/profile");

    expect(result.status).toBe(200);
    expect(mocks.getState).toHaveBeenCalledWith("user_verified");
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("does not accept a query-supplied owner identity", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get(
      "/api/smart-match/access?userId=user_owner&owner=true",
    );

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(false);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
  });

  it("does not bootstrap a non-owner who supplies the owner ID", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get(
      "/api/smart-match/bootstrap?userId=user_owner&owner=true",
    );

    expect(result.status).toBe(200);
    expect(result.body.access.premium).toBe(false);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("still requires authentication for an owner-supplied query", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app).get(
      "/api/smart-match/access?userId=user_owner",
    );

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("does not grant owner access for malformed configuration", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "not-a-clerk-user");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/access");

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(false);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
  });

  it("preserves global-budget errors for the owner", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    mocks.answer.mockRejectedValue(
      new SmartMatchError(
        429,
        "AI has reached today’s service budget. Try again tomorrow.",
      ),
    );

    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "Explain my fit." });

    expect(result.status).toBe(429);
    expect(result.body.message).toBe(
      "AI has reached today’s service budget. Try again tomorrow.",
    );
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });
});
