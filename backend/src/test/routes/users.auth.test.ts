import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreateUser: vi.fn(),
}));

// Only the database service is mocked.
// Clerk middleware and token verification remain real.
vi.mock("../../services/users.service.js", () => ({
  getOrCreateUser: mocks.getOrCreateUser,
}));

const trustedKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const untrustedKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const frontendOrigin = "http://localhost:3000";
const issuer = "https://unit-test.clerk.accounts.dev";

const storedUser = {
  id: "a4c4cf3d-9584-4b14-8a2f-16e0faab7764",
  clerkUserId: "user_test",
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

type TokenOptions = {
  expired?: boolean;
  origin?: string;
  signingKey?: KeyObject;
};

function createToken({
  expired = false,
  origin = frontendOrigin,
  signingKey = trustedKeys.privateKey,
}: TokenOptions = {}) {
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: "test-key",
    }),
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      sub: "user_test",
      sid: "session_test",
      azp: origin,
      iat: now - 3600,
      nbf: now - 3600,
      exp: expired ? now - 300 : now + 300,
    }),
  ).toString("base64url");

  const unsignedToken = `${header}.${payload}`;

  const signature = sign(
    "RSA-SHA256",
    Buffer.from(unsignedToken),
    signingKey,
  ).toString("base64url");

  return `${unsignedToken}.${signature}`;
}

describe("user route with real Clerk token verification", () => {
  const app = express();

  beforeAll(async () => {
    // Synthetic settings used only inside this test process.
    const publishableKey =
      "pk_test_" +
      Buffer.from("unit-test.clerk.accounts.dev$").toString("base64");

    vi.stubEnv("CLERK_PUBLISHABLE_KEY", publishableKey);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_unit_test_only");
    vi.stubEnv("CLERK_TELEMETRY_DISABLED", "true");

    vi.stubEnv(
      "CLERK_JWT_KEY",
      trustedKeys.publicKey
        .export({
          type: "spki",
          format: "pem",
        })
        .toString(),
    );

    const { createUsersRouter } = await import("../../routes/users.routes.js");

    app.use(express.json());
    app.use("/api/users", createUsersRouter(frontendOrigin));
  });

  beforeEach(() => {
    mocks.getOrCreateUser.mockReset();
    mocks.getOrCreateUser.mockResolvedValue(storedUser);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed session token", async () => {
    const response = await request(app)
      .post("/api/users/me")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: storedUser });

    expect(mocks.getOrCreateUser).toHaveBeenCalledWith("user_test");
  });

  it("rejects a request without a token", async () => {
    const response = await request(app).post("/api/users/me");

    expect(response.status).toBe(401);
    expect(mocks.getOrCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed token", async () => {
    const response = await request(app)
      .post("/api/users/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(mocks.getOrCreateUser).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const response = await request(app)
      .post("/api/users/me")
      .set("Authorization", `Bearer ${createToken({ expired: true })}`);

    expect(response.status).toBe(401);
    expect(mocks.getOrCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a token signed by an untrusted key", async () => {
    const response = await request(app)
      .post("/api/users/me")
      .set(
        "Authorization",
        `Bearer ${createToken({
          signingKey: untrustedKeys.privateKey,
        })}`,
      );

    expect(response.status).toBe(401);
    expect(mocks.getOrCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a token from an unauthorized frontend origin", async () => {
    const response = await request(app)
      .post("/api/users/me")
      .set(
        "Authorization",
        `Bearer ${createToken({
          origin: "https://other.example",
        })}`,
      );

    expect(response.status).toBe(401);
    expect(mocks.getOrCreateUser).not.toHaveBeenCalled();
  });
});
