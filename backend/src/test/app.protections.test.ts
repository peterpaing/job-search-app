import type { RequestHandler } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limited: false,
  shuttingDown: false,
  limiter: vi.fn(),
  webhook: vi.fn(),
}));

vi.mock("../runtime.js", () => ({
  isShuttingDown: () => mocks.shuttingDown,
}));

vi.mock("../middleware/rate-limit.middleware.js", () => ({
  createApiRateLimiter: (): RequestHandler => (req, res, next) => {
    mocks.limiter(req.method, req.path);

    if (mocks.limited) {
      res.status(429).json({ message: "Limited" });
      return;
    }

    next();
  },
}));

vi.mock("../routes/health.routes.js", async () => {
  const { Router } = await import("express");
  const router = Router();

  router.get("/live", (_req, res) => {
    res.json({ status: "alive" });
  });

  return { createHealthRouter: () => router };
});

vi.mock("../routes/jobs.routes.js", async () => {
  const { Router } = await import("express");
  const router = Router();

  router.get("/jobs", (_req, res) => {
    res.json({ jobs: [] });
  });

  return { router };
});

vi.mock("../routes/users.routes.js", async () => {
  const { Router } = await import("express");
  return { createUsersRouter: () => Router() };
});

vi.mock("../routes/saved-jobs.routes.js", async () => {
  const { Router } = await import("express");
  return { createSavedJobsRouter: () => Router() };
});

vi.mock("../routes/applications.routes.js", async () => {
  const { Router } = await import("express");
  return { createApplicationsRouter: () => Router() };
});

vi.mock("../routes/smart-match.routes.js", async () => {
  const { Router } = await import("express");
  return { createSmartMatchRouter: () => Router() };
});

vi.mock("../routes/account-deletion.routes.js", async () => {
  const { Router } = await import("express");
  return { createAccountDeletionRouter: () => Router() };
});

vi.mock("../routes/billing.routes.js", async () => {
  const { Router } = await import("express");

  const stripeWebhook: RequestHandler = (req, res) => {
    mocks.webhook(req.body, req.get("stripe-signature"));

    res.status(202).json({ received: true });
  };

  return {
    createBillingRouter: () => Router(),
    stripeWebhook,
  };
});

import app from "../app.js";

beforeEach(() => {
  vi.clearAllMocks();

  mocks.limited = false;
  mocks.shuttingDown = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("app protection ordering", () => {
  it("applies ordinary limiting to API routes", async () => {
    mocks.limited = true;

    const result = await request(app).get("/api/jobs");

    expect(result.status).toBe(429);
    expect(mocks.limiter).toHaveBeenCalledOnce();
  });

  it("keeps health checks outside ordinary rate limits", async () => {
    mocks.limited = true;

    const result = await request(app).get("/health/live");

    expect(result.status).toBe(200);
    expect(mocks.limiter).not.toHaveBeenCalled();
  });

  it("passes exact webhook bytes and signature without ordinary limiting", async () => {
    mocks.limited = true;

    const payload = '{ "id": "evt_test", "value": 1 }\n';

    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "test-signature")
      .send(payload);

    expect(result.status).toBe(202);
    expect(mocks.limiter).not.toHaveBeenCalled();

    const [body, signature] = mocks.webhook.mock.calls[0];

    expect(Buffer.isBuffer(body)).toBe(true);
    expect((body as Buffer).equals(Buffer.from(payload))).toBe(true);
    expect(signature).toBe("test-signature");
  });

  it("rejects new API work during shutdown", async () => {
    mocks.shuttingDown = true;

    const result = await request(app).get("/api/jobs");

    expect(result.status).toBe(503);
    expect(result.headers["retry-after"]).toBe("5");
    expect(result.headers["cache-control"]).toBe("no-store");

    expect(mocks.limiter).not.toHaveBeenCalled();
  });

  it("does not falsely acknowledge webhooks during shutdown", async () => {
    mocks.shuttingDown = true;

    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .send({ id: "evt_retry_later" });

    expect(result.status).toBe(503);
    expect(mocks.webhook).not.toHaveBeenCalled();
  });

  it("keeps liveness available during shutdown", async () => {
    mocks.shuttingDown = true;

    expect((await request(app).get("/health/live")).status).toBe(200);
  });
});
