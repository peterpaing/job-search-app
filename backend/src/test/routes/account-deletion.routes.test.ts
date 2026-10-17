import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  has: vi.fn(),
  requestDeletion: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: mocks.getAuth,
}));

// Prevent importing the real Neon connection through the error class.
vi.mock("../../db/index.js", () => ({
  db: { execute: vi.fn() },
}));

vi.mock("../../services/account-deletion.service.js", () => ({
  requestAccountDeletion: mocks.requestDeletion,
}));

import { AccountDeletionError } from "../../services/account-deletion.state.js";
import { createAccountDeletionRouter } from "../../routes/account-deletion.routes.js";

const origin = "http://localhost:3000";
const app = express();

app.use(express.json());
app.use("/api/account", createAccountDeletionRouter(origin));

function auth(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    userId: "user_verified",
    actor: null,
    has: mocks.has,
    ...overrides,
  };
}

function submit(body = { confirmation: "DELETE" }) {
  return request(app)
    .post("/api/account/deletion")
    .set("Origin", origin)
    .send(body);
}

describe("account deletion endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.has.mockReturnValue(true);
    mocks.getAuth.mockReturnValue(auth());
    mocks.requestDeletion.mockResolvedValue({ status: "pending" });
  });

  it("rejects signed-out users", async () => {
    mocks.getAuth.mockReturnValue(
      auth({ isAuthenticated: false, userId: null }),
    );

    const response = await submit();

    expect(response.status).toBe(401);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("rejects authentication without a user ID", async () => {
    mocks.getAuth.mockReturnValue(auth({ userId: null }));

    expect((await submit()).status).toBe(401);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("rejects impersonation", async () => {
    mocks.getAuth.mockReturnValue(
      auth({ actor: { sub: "user_impersonator" } }),
    );

    expect((await submit()).status).toBe(403);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://untrusted.example"])(
    "rejects an absent or untrusted origin: %s",
    async (requestOrigin) => {
      const operation = request(app).post("/api/account/deletion");

      if (requestOrigin) {
        operation.set("Origin", requestOrigin);
      }

      const response = await operation.send({ confirmation: "DELETE" });

      expect(response.status).toBe(403);
      expect(mocks.requestDeletion).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { confirmation: "delete" },
    { confirmation: " DELETE " },
    { confirmation: "DELETE", userId: "user_other" },
  ])("rejects invalid confirmation bodies: %j", async (body) => {
    const response = await request(app)
      .post("/api/account/deletion")
      .set("Origin", origin)
      .send(body);

    expect(response.status).toBe(400);
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("requires recent strict verification", async () => {
    mocks.has.mockReturnValue(false);

    const response = await submit();

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("clerk_error");
    expect(mocks.has).toHaveBeenCalledWith({
      reverification: "strict",
    });
    expect(mocks.requestDeletion).not.toHaveBeenCalled();
  });

  it("queues deletion using only the verified identity", async () => {
    const response = await request(app)
      .post("/api/account/deletion?userId=user_other")
      .set("Origin", origin)
      .send({ confirmation: "DELETE" });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: "pending" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.requestDeletion).toHaveBeenCalledExactlyOnceWith(
      "user_verified",
    );
    expect(mocks.getAuth).toHaveBeenCalledWith(expect.anything(), {
      acceptsToken: "session_token",
      treatPendingAsSignedOut: true,
    });
  });

  it("returns 200 for an already completed deletion", async () => {
    mocks.requestDeletion.mockResolvedValue({ status: "completed" });

    const response = await submit();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "completed" });
  });

  it("preserves an expected safe service error", async () => {
    mocks.requestDeletion.mockRejectedValue(
      new AccountDeletionError(409, "An operation is still running."),
    );

    const response = await submit();

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: "An operation is still running.",
    });
  });

  it("does not expose unexpected internal errors", async () => {
    mocks.requestDeletion.mockRejectedValue(
      new Error("private database connection details"),
    );

    const response = await submit();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      message: "Unable to confirm your deletion request. Please try again.",
    });
    expect(JSON.stringify(response.body)).not.toContain("private");
  });
});
