import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createAiRequestLimiter,
  createApiRateLimiter,
} from "../../middleware/rate-limit.middleware.js";

function apiApp() {
  const app = express();

  // Test-only IP injection. This tests counter isolation,
  // not production proxy-header trust.
  app.use((req, _res, next) => {
    Object.defineProperty(req, "ip", {
      value: req.get("x-test-ip") ?? "192.0.2.1",
      configurable: true,
    });

    next();
  });

  app.use(createApiRateLimiter());

  app.use((_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

function aiApp() {
  const app = express();

  // This stands in for already-verified authentication.
  app.use((req, res, next) => {
    const userId = req.get("x-test-user");

    if (!userId) {
      res.status(401).json({ message: "Sign in." });
      return;
    }

    res.locals.clerkUserId = userId;
    next();
  });

  app.use(createAiRequestLimiter());

  app.use((_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("API rate limiter", () => {
  it("allows 300 requests and rejects the next for the same IP", async () => {
    const app = apiApp();

    for (let index = 0; index < 300; index += 1) {
      expect((await request(app).get("/api/example")).status).toBe(200);
    }

    const blocked = await request(app).get("/api/example");

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers["cache-control"]).toBe("no-store");

    expect(blocked.body).toEqual({
      message: "Too many requests. Please wait a moment and try again.",
    });

    const otherIp = await request(app)
      .get("/api/example")
      .set("x-test-ip", "198.51.100.1");

    expect(otherIp.status).toBe(200);
  }, 15_000);

  it("does not count OPTIONS requests", async () => {
    const app = apiApp();

    for (let index = 0; index < 301; index += 1) {
      expect((await request(app).options("/api/example")).status).toBe(200);
    }

    expect((await request(app).get("/api/example")).status).toBe(200);
  }, 15_000);
});

describe("AI request rate limiter", () => {
  it("allows ten requests and rejects the eleventh", async () => {
    const app = aiApp();

    for (let index = 0; index < 10; index += 1) {
      const result = await request(app)
        .post("/ask")
        .set("x-test-user", "user-a");

      expect(result.status).toBe(200);
    }

    const blocked = await request(app)
      .post("/ask")
      .set("x-test-user", "user-a");

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers["cache-control"]).toBe("no-store");

    expect(blocked.body).toEqual({
      message: "Too many AI requests. Please wait a moment and try again.",
    });
  });

  it("shares one user's allowance between ask and extract", async () => {
    const app = aiApp();

    for (let index = 0; index < 10; index += 1) {
      const path = index % 2 === 0 ? "/ask" : "/extract";

      expect(
        (await request(app).post(path).set("x-test-user", "user-a")).status,
      ).toBe(200);
    }

    expect(
      (await request(app).post("/extract").set("x-test-user", "user-a")).status,
    ).toBe(429);
  });

  it("keeps different users separate even on the same IP", async () => {
    const app = aiApp();

    for (let index = 0; index < 10; index += 1) {
      await request(app).post("/ask").set("x-test-user", "user-a");
    }

    expect(
      (await request(app).post("/ask").set("x-test-user", "user-a")).status,
    ).toBe(429);

    expect(
      (await request(app).post("/ask").set("x-test-user", "user-b")).status,
    ).toBe(200);
  });

  it("does not count GET requests against the POST allowance", async () => {
    const app = aiApp();

    for (let index = 0; index < 12; index += 1) {
      expect(
        (await request(app).get("/ask").set("x-test-user", "user-a")).status,
      ).toBe(200);
    }

    expect(
      (await request(app).post("/ask").set("x-test-user", "user-a")).status,
    ).toBe(200);
  });

  it("requires authentication before applying the user limiter", async () => {
    const app = aiApp();

    expect((await request(app).post("/ask")).status).toBe(401);
  });
});
