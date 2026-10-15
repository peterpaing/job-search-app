import express from "express";
import request from "supertest";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getBillingStatus: vi.fn(),
  createCheckout: vi.fn(),
  createPortal: vi.fn(),
  refreshBilling: vi.fn(),
  confirmCheckout: vi.fn(),
  handleBillingEvent: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: mocks.getAuth,
}));

vi.mock("../../services/billing.service.js", () => ({
  getBillingStatus: mocks.getBillingStatus,
  createCheckout: mocks.createCheckout,
  createPortal: mocks.createPortal,
  refreshBilling: mocks.refreshBilling,
  confirmCheckout: mocks.confirmCheckout,
  handleBillingEvent: mocks.handleBillingEvent,
}));

import {
  createBillingRouter,
  stripeWebhook,
} from "../../routes/billing.routes.js";
import { BillingError } from "../../services/billing.config.js";

const clerkId = "user_verified_billing";
const webhookSecret = "whsec_local_test_only";

// Signature generation is local cryptography, not a Stripe API call.
const signer = new Stripe("sk_test_local_only");

const app = express();

// Keep the same middleware order as the real application.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

app.use(express.json());
app.use("/api/billing", createBillingRouter("http://localhost:3000"));

function webhookPayload(livemode = false) {
  return JSON.stringify({
    id: "evt_route_test",
    object: "event",
    type: "invoice.paid",
    livemode,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "in_route_test",
        object: "invoice",
        customer: "cus_route_test",
      },
    },
  });
}

function signature(payload: string) {
  return signer.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
}

describe("Billing routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubEnv("BILLING_MODE", "test");
    vi.stubEnv("BILLING_LIVE_ENABLED", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_only");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_test");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_test");
    vi.stubEnv("FRONTEND_ORIGIN", "http://localhost:3000");

    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: clerkId,
    });

    mocks.getBillingStatus.mockResolvedValue({
      premium: false,
      status: "none",
    });

    mocks.createCheckout.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/test",
    });

    mocks.createPortal.mockResolvedValue({
      url: "https://billing.stripe.com/p/session/test",
    });

    mocks.refreshBilling.mockResolvedValue({ premium: true });
    mocks.confirmCheckout.mockResolvedValue({ premium: true });
    mocks.handleBillingEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects signed-out billing requests", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app).get("/api/billing/status");

    expect(result.status).toBe(401);
    expect(mocks.getBillingStatus).not.toHaveBeenCalled();
  });

  it("rejects authentication without a verified user ID", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: null,
    });

    const result = await request(app).get("/api/billing/status");

    expect(result.status).toBe(401);
  });

  it("reads status using verified identity, not the query", async () => {
    const result = await request(app).get(
      "/api/billing/status?userId=user_someone_else",
    );

    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(mocks.getBillingStatus).toHaveBeenCalledWith(clerkId);
  });

  it.each([{}, { consent: false }])(
    "requires explicit subscription consent: %j",
    async (body) => {
      const result = await request(app)
        .post("/api/billing/checkout")
        .send(body);

      expect(result.status).toBe(400);
      expect(mocks.createCheckout).not.toHaveBeenCalled();
    },
  );

  it("rejects extra identity fields in checkout", async () => {
    const result = await request(app).post("/api/billing/checkout").send({
      consent: true,
      userId: "user_someone_else",
    });

    expect(result.status).toBe(400);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("creates checkout for the verified user", async () => {
    const result = await request(app)
      .post("/api/billing/checkout")
      .send({ consent: true });

    expect(result.status).toBe(200);
    expect(mocks.createCheckout).toHaveBeenCalledWith(clerkId);
  });

  it("opens management for the verified user", async () => {
    const result = await request(app)
      .post("/api/billing/portal")
      .send({ userId: "user_someone_else" });

    expect(result.status).toBe(200);
    expect(mocks.createPortal).toHaveBeenCalledWith(clerkId);
  });

  it("refreshes the verified user's billing", async () => {
    const result = await request(app).post("/api/billing/refresh").send({});

    expect(result.status).toBe(200);
    expect(mocks.refreshBilling).toHaveBeenCalledWith(clerkId);
  });

  it("rejects an invalid checkout session ID", async () => {
    const result = await request(app)
      .post("/api/billing/confirm")
      .send({ sessionId: "not-a-session" });

    expect(result.status).toBe(400);
    expect(mocks.confirmCheckout).not.toHaveBeenCalled();
  });

  it("confirms checkout using the verified user", async () => {
    const result = await request(app)
      .post("/api/billing/confirm")
      .send({ sessionId: "cs_test_confirm" });

    expect(result.status).toBe(200);
    expect(mocks.confirmCheckout).toHaveBeenCalledWith(
      clerkId,
      "cs_test_confirm",
    );
  });

  it("returns known billing errors", async () => {
    mocks.createCheckout.mockRejectedValue(
      new BillingError(409, "Billing is updating."),
    );

    const result = await request(app)
      .post("/api/billing/checkout")
      .send({ consent: true });

    expect(result.status).toBe(409);
    expect(result.body.message).toBe("Billing is updating.");
  });

  it("does not expose unexpected internal errors", async () => {
    mocks.createCheckout.mockRejectedValue(
      new Error("private internal details"),
    );

    const result = await request(app)
      .post("/api/billing/checkout")
      .send({ consent: true });

    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain(
      "private internal details",
    );
  });

  it("rejects a webhook without a signature", async () => {
    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .send(webhookPayload());

    expect(result.status).toBe(400);
    expect(mocks.handleBillingEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid webhook signature", async () => {
    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "invalid")
      .send(webhookPayload());

    expect(result.status).toBe(400);
    expect(mocks.handleBillingEvent).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed webhook without Clerk login", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const payload = webhookPayload();

    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature(payload))
      .send(payload);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true });
    expect(mocks.handleBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt_route_test",
        type: "invoice.paid",
        livemode: false,
      }),
    );
  });

  it("rejects a modified payload after signing", async () => {
    const original = webhookPayload();
    const modified = original.replace("cus_route_test", "cus_someone_else");

    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature(original))
      .send(modified);

    expect(result.status).toBe(400);
    expect(mocks.handleBillingEvent).not.toHaveBeenCalled();
  });

  it("rejects live-mode events in test mode", async () => {
    const payload = webhookPayload(true);

    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature(payload))
      .send(payload);

    expect(result.status).toBe(400);
    expect(mocks.handleBillingEvent).not.toHaveBeenCalled();
  });

  it("returns 503 when webhook processing fails so Stripe can retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.handleBillingEvent.mockRejectedValue(
      new Error("temporary processing failure"),
    );

    const payload = webhookPayload();

    const result = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature(payload))
      .send(payload);

    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      message: "Webhook processing needs a retry.",
    });
  });
});
