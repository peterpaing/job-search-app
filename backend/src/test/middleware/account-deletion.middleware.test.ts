import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("../../db/index.js", () => ({
  db: { execute: mocks.execute },
}));

import { accountDeletionGuard } from "../../middleware/account-deletion.middleware.js";
import {
  accountDeletionEnabled,
  clerkIdentityHash,
  isUserDeletionRequested,
} from "../../services/account-deletion.state.js";

const app = express();

app.use(accountDeletionGuard);
app.get("/private", (_req, res) => {
  res.json({ reached: true });
});

describe("account deletion guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: "user_verified",
    });
    mocks.execute.mockResolvedValue({
      rows: [{ requested: false }],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows active accounts", async () => {
    const response = await request(app).get("/private");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: true });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("leaves signed-out rejection to the following route", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const response = await request(app).get("/private");

    expect(response.status).toBe(200);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("blocks an account with a deletion marker", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{ requested: true }],
    });

    const response = await request(app).get("/private");

    expect(response.status).toBe(410);
    expect(response.body.message).toContain(
      "Account deletion has been requested",
    );
    expect(response.body).not.toHaveProperty("reached");
  });

  it("fails closed when the database is unavailable", async () => {
    mocks.execute.mockRejectedValue(new Error("private connection details"));

    const response = await request(app).get("/private");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      message: "Account verification is temporarily unavailable.",
    });
  });

  it("fails closed for malformed database results", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{ requested: "false" }],
    });

    expect((await request(app).get("/private")).status).toBe(503);
  });

  it("fails closed when authentication inspection throws", async () => {
    mocks.getAuth.mockImplementation(() => {
      throw new Error("authentication unavailable");
    });

    expect((await request(app).get("/private")).status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("continues checking deletion state when the feature is disabled", async () => {
    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "false");
    vi.stubEnv("ACCOUNT_DELETION_WORKER_ENABLED", "false");
    mocks.execute.mockResolvedValue({
      rows: [{ requested: true }],
    });

    expect((await request(app).get("/private")).status).toBe(410);
  });

  it.each([
    ["true", "true", true],
    ["true", "false", false],
    ["false", "true", false],
    ["false", "false", false],
    ["ture", "true", false],
  ])(
    "requires both exact feature flags: %s / %s",
    (enabled, worker, expected) => {
      vi.stubEnv("ACCOUNT_DELETION_ENABLED", enabled);
      vi.stubEnv("ACCOUNT_DELETION_WORKER_ENABLED", worker);

      expect(accountDeletionEnabled()).toBe(expected);
    },
  );

  it("produces a deterministic non-plaintext identity hash", () => {
    const hash = clerkIdentityHash("user_verified");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(clerkIdentityHash("user_verified"));
    expect(hash).not.toBe(clerkIdentityHash("user_other"));
    expect(hash).not.toContain("user_verified");
  });

  it.each([true, false])(
    "returns the user deletion state: %s",
    async (requested) => {
      mocks.execute.mockResolvedValue({
        rows: [{ requested }],
      });

      await expect(
        isUserDeletionRequested("11111111-1111-4111-8111-111111111111"),
      ).resolves.toBe(requested);
    },
  );
});
