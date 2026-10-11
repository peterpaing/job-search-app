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
  getApplications: vi.fn(),
  trackApplication: vi.fn(),
  updateApplication: vi.fn(),
  removeApplication: vi.fn(),
}));

// Clerk middleware and signature verification remain real.
vi.mock("../../services/applications.service.js", () => ({
  getApplications: mocks.getApplications,
  trackApplication: mocks.trackApplication,
  updateApplication: mocks.updateApplication,
  removeApplication: mocks.removeApplication,
}));

const trustedKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const untrustedKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const frontendOrigin = "http://localhost:3000";
const issuer = "https://unit-test.clerk.accounts.dev";

function token({
  expired = false,
  origin = frontendOrigin,
  key = trustedKeys.privateKey,
}: {
  expired?: boolean;
  origin?: string;
  key?: KeyObject;
} = {}) {
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
      sub: "user_verified",
      sid: "session_test",
      azp: origin,
      iat: now - 3600,
      nbf: now - 3600,
      exp: expired ? now - 300 : now + 300,
    }),
  ).toString("base64url");

  const unsigned = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), key).toString(
    "base64url",
  );

  return `${unsigned}.${signature}`;
}

describe("applications with real Clerk token verification", () => {
  const app = express();

  beforeAll(async () => {
    vi.stubEnv(
      "CLERK_PUBLISHABLE_KEY",
      "pk_test_" +
        Buffer.from("unit-test.clerk.accounts.dev$").toString("base64"),
    );

    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_unit_test_only");
    vi.stubEnv("CLERK_TELEMETRY_DISABLED", "true");

    vi.stubEnv(
      "CLERK_JWT_KEY",
      trustedKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    );

    const { createApplicationsRouter } =
      await import("../../routes/applications.routes.js");

    app.use(express.json());
    app.use("/api/applications", createApplicationsRouter(frontendOrigin));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApplications.mockResolvedValue([]);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed session token", async () => {
    const result = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token()}`);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ applications: [] });
    expect(mocks.getApplications).toHaveBeenCalledWith("user_verified");
  });

  it.each([
    ["get", "/api/applications"],
    ["put", "/api/applications/job-a"],
    ["patch", "/api/applications/job-a"],
    ["delete", "/api/applications/job-a"],
  ] as const)("rejects missing tokens on %s", async (method, path) => {
    const result = await request(app)[method](path).send({
      status: "applied",
    });

    expect(result.status).toBe(401);
    expect(mocks.getApplications).not.toHaveBeenCalled();
    expect(mocks.trackApplication).not.toHaveBeenCalled();
    expect(mocks.updateApplication).not.toHaveBeenCalled();
    expect(mocks.removeApplication).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", (): string => "invalid-token"],
    ["expired", (): string => token({ expired: true })],
    [
      "untrusted signature",
      (): string => token({ key: untrustedKeys.privateKey }),
    ],
    [
      "unauthorized origin",
      (): string => token({ origin: "https://other.example" }),
    ],
  ] as const)("rejects %s tokens", async (_name, createToken) => {
    const result = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(result.status).toBe(401);
    expect(mocks.getApplications).not.toHaveBeenCalled();
  });
});
