import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getOrCreateUser: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => {
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
  getAuth: mocks.getAuth,
}));

vi.mock("../../services/users.service.js", () => ({
  getOrCreateUser: mocks.getOrCreateUser,
}));

import { createUsersRouter } from "../../routes/users.routes.js";

const app = express();

app.use(express.json());
app.use("/api/users", createUsersRouter("http://localhost:3000"));

const storedUser = {
  id: "a4c4cf3d-9584-4b14-8a2f-16e0faab7764",
  clerkUserId: "user_verified",
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

describe("POST /api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: "user_verified",
    });

    mocks.getOrCreateUser.mockResolvedValue(storedUser);
  });

  it("rejects signed-out users without accessing the database", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const response = await request(app).post("/api/users/me");

    expect(response.status).toBe(401);
    expect(mocks.getOrCreateUser).not.toHaveBeenCalled();
  });

  it("rejects an authenticated result without a user ID", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: null,
    });

    const response = await request(app).post("/api/users/me");

    expect(response.status).toBe(401);
    expect(mocks.getOrCreateUser).not.toHaveBeenCalled();
  });

  it("returns the account belonging to the verified session", async () => {
    const response = await request(app).post("/api/users/me");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: storedUser });
    expect(mocks.getOrCreateUser).toHaveBeenCalledWith("user_verified");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("ignores user IDs supplied by the client", async () => {
    const response = await request(app)
      .post("/api/users/me?userId=user_other")
      .send({
        userId: "user_other",
        clerkUserId: "user_other",
      });

    expect(response.status).toBe(200);
    expect(mocks.getOrCreateUser).toHaveBeenCalledWith("user_verified");
    expect(mocks.getOrCreateUser).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error when database access fails", async () => {
    mocks.getOrCreateUser.mockRejectedValue(
      new Error("Private database error"),
    );

    const response = await request(app).post("/api/users/me");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Unable to load your account. Please try again.",
    });
    expect(response.text).not.toContain("Private database error");
  });
});
