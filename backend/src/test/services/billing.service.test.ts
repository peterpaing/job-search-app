import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import type Stripe from "stripe";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  client: undefined as PGlite | undefined,
  pricesRetrieve: vi.fn(),
  customersCreate: vi.fn(),
  subscriptionsList: vi.fn(),
  subscriptionsUpdate: vi.fn(),
  invoiceLines: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
  portalConfiguration: vi.fn(),
  portalCreate: vi.fn(),
  chargesRetrieve: vi.fn(),
}));

// Never import the real Neon connection.
vi.mock("../../db/index.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");

  const client = new PGlite();
  mocks.client = client;

  return { db: drizzle(client) };
});

// Keep real configuration validation, but replace every Stripe API call.
vi.mock("../../services/billing.config.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/billing.config.js")>();

  return {
    ...actual,
    getStripe: () => ({
      prices: { retrieve: mocks.pricesRetrieve },
      customers: { create: mocks.customersCreate },
      subscriptions: {
        list: mocks.subscriptionsList,
        update: mocks.subscriptionsUpdate,
      },
      invoices: { listLineItems: mocks.invoiceLines },
      checkout: {
        sessions: {
          create: mocks.checkoutCreate,
          retrieve: mocks.checkoutRetrieve,
        },
      },
      billingPortal: {
        configurations: {
          retrieve: mocks.portalConfiguration,
        },
        sessions: { create: mocks.portalCreate },
      },
      charges: { retrieve: mocks.chargesRetrieve },
    }),
  };
});

import {
  confirmCheckout,
  createCheckout,
  getBillingStatus,
  handleBillingEvent,
  refreshBilling,
} from "../../services/billing.service.js";

const clerkId = "user_billing_test";
const customerId = "cus_billing_test";
const checkoutUrl = "https://checkout.stripe.com/c/pay/test";
const portalUrl = "https://billing.stripe.com/p/session/test";

let userId = "";
let subscriptions: Stripe.Subscription[] = [];

function database() {
  if (!mocks.client) {
    throw new Error("Local test database was not initialized.");
  }

  return mocks.client;
}

function subscription(
  options: {
    status?: Stripe.Subscription.Status;
    paid?: boolean;
    end?: number;
    cancelAtPeriodEnd?: boolean;
    cancelAt?: number | null;
    customer?: string;
    price?: string;
  } = {},
): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  const end = options.end ?? now + 30 * 24 * 60 * 60;
  const price = options.price ?? "price_pro_test";

  return {
    id: "sub_billing_test",
    object: "subscription",
    customer: options.customer ?? customerId,
    livemode: false,
    status: options.status ?? "active",
    pause_collection: null,
    cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
    cancel_at: options.cancelAt ?? null,
    items: {
      has_more: false,
      data: [
        {
          id: "si_billing_test",
          quantity: 1,
          price: { id: price },
          current_period_start: now - 3600,
          current_period_end: end,
        },
      ],
    },
    latest_invoice: {
      id: "in_billing_test",
      status: options.paid === false ? "open" : "paid",
      lines: {
        has_more: false,
        data: [
          {
            id: "il_billing_test",
            period: {
              start: now - 3600,
              end,
            },
            pricing: {
              price_details: { price },
            },
          },
        ],
      },
    },
  } as unknown as Stripe.Subscription;
}

function event(
  id: string,
  type = "customer.subscription.updated",
  object: Record<string, unknown> = { customer: customerId },
): Stripe.Event {
  return {
    id,
    object: "event",
    type,
    livemode: false,
    data: { object },
  } as unknown as Stripe.Event;
}

function completedCheckout(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_complete",
    customer: customerId,
    client_reference_id: userId,
    livemode: false,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    ...overrides,
  };
}

describe("Billing service with a temporary local database", () => {
  beforeAll(async () => {
    const migrations = [
      "0000_next_jimmy_woo.sql",
      "0001_flawless_robin_chapel.sql",
      "0002_cute_magik.sql",
      "0003_wealthy_sasquatch.sql",
      "0004_far_harry_osborn.sql",
      "0005_smart-match-guards.sql",
      "0006_smart-match-cost-controls.sql",
      "0007_job-availability.sql",
      "0008_premium-billing.sql",
      "0009_premium-billing-functions.sql",
    ];

    for (const name of migrations) {
      const contents = await readFile(
        new URL(`../../../drizzle/${name}`, import.meta.url),
        "utf8",
      );

      await database().exec(contents);
    }
  }, 60_000);

  beforeEach(async () => {
    vi.resetAllMocks();

    vi.stubEnv("BILLING_MODE", "test");
    vi.stubEnv("BILLING_LIVE_ENABLED", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_only");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_test");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_test");
    vi.stubEnv("FRONTEND_ORIGIN", "http://localhost:3000");
    vi.stubEnv("BILLING_AUTOMATIC_TAX", "false");

    subscriptions = [];

    mocks.subscriptionsList.mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        for (const item of subscriptions) {
          yield item;
        }
      },
    }));

    mocks.pricesRetrieve.mockResolvedValue({
      id: "price_pro_test",
      active: true,
      livemode: false,
      currency: "usd",
      unit_amount: 199,
      billing_scheme: "per_unit",
      transform_quantity: null,
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
    });

    mocks.portalConfiguration.mockResolvedValue({
      active: true,
      features: {
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
        },
        subscription_update: { enabled: false },
      },
    });

    mocks.portalCreate.mockResolvedValue({ url: portalUrl });

    mocks.checkoutCreate.mockResolvedValue({
      id: "cs_test_open",
      status: "open",
      url: checkoutUrl,
    });

    mocks.checkoutRetrieve.mockResolvedValue({
      id: "cs_test_open",
      status: "open",
      url: checkoutUrl,
    });

    await database().exec("BEGIN");

    const inserted = await database().query<{ id: string }>(
      "INSERT INTO users (clerk_user_id) VALUES ($1) RETURNING id",
      [clerkId],
    );

    userId = inserted.rows[0]!.id;

    await database().query(
      `
        INSERT INTO billing_customers (
          user_id,
          livemode,
          stripe_customer_id
        )
        VALUES ($1::uuid, false, $2)
      `,
      [userId, customerId],
    );
  });

  afterEach(async () => {
    try {
      await database().exec("ROLLBACK");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  afterAll(async () => {
    await mocks.client?.close();
  });

  it("does not grant Pro just because checkout opened", async () => {
    await expect(createCheckout(clerkId)).resolves.toEqual({
      url: checkoutUrl,
    });

    expect((await getBillingStatus(clerkId)).premium).toBe(false);
  });

  it("grants Pro for an active subscription with a paid invoice", async () => {
    subscriptions = [subscription()];

    const status = await refreshBilling(clerkId);

    expect(status.premium).toBe(true);
    expect(status.status).toBe("active");
    expect(status.cancelAtPeriodEnd).toBe(false);
    expect(status.paidUntil).not.toBeNull();
  });

  it("does not grant Pro for an unpaid invoice", async () => {
    subscriptions = [subscription({ paid: false })];

    expect((await refreshBilling(clerkId)).premium).toBe(false);
  });

  it("does not grant Pro for a different price", async () => {
    subscriptions = [subscription({ price: "price_other" })];

    expect((await refreshBilling(clerkId)).premium).toBe(false);
  });

  it("keeps paid access when cancellation is scheduled", async () => {
    subscriptions = [subscription({ cancelAtPeriodEnd: true })];

    const status = await refreshBilling(clerkId);

    expect(status.premium).toBe(true);
    expect(status.cancelAtPeriodEnd).toBe(true);
    expect(status.paidUntil).not.toBeNull();
  });

  it("recognizes cancel_at at the current period end", async () => {
    const end = Math.floor(Date.now() / 1000) + 86400;

    subscriptions = [
      subscription({
        end,
        cancelAt: end,
        cancelAtPeriodEnd: false,
      }),
    ];

    const status = await refreshBilling(clerkId);

    expect(status.premium).toBe(true);
    expect(status.cancelAtPeriodEnd).toBe(true);
  });

  it("removes access after the paid period expires", async () => {
    subscriptions = [subscription()];
    await refreshBilling(clerkId);

    await database().exec(`
      UPDATE billing_subscriptions
      SET paid_until = now() - interval '1 minute'
    `);

    expect((await getBillingStatus(clerkId)).premium).toBe(false);
  });

  it("does not grant access to a canceled subscription", async () => {
    subscriptions = [subscription({ status: "canceled" })];

    expect((await refreshBilling(clerkId)).premium).toBe(false);
  });

  it("extends paid access after a successful renewal", async () => {
    const now = Math.floor(Date.now() / 1000);
    const firstEnd = now + 30 * 86400;
    const renewedEnd = now + 60 * 86400;

    subscriptions = [subscription({ end: firstEnd })];
    const before = await refreshBilling(clerkId);

    subscriptions = [subscription({ end: renewedEnd })];
    await handleBillingEvent(event("evt_renewal", "invoice.paid"));

    const after = await getBillingStatus(clerkId);

    expect(before.paidUntil).toBe(new Date(firstEnd * 1000).toISOString());
    expect(after.paidUntil).toBe(new Date(renewedEnd * 1000).toISOString());
    expect(after.premium).toBe(true);
  });

  it("removes access for a past-due unpaid subscription", async () => {
    subscriptions = [
      subscription({
        status: "past_due",
        paid: false,
      }),
    ];

    await handleBillingEvent(
      event("evt_failed_payment", "invoice.payment_failed"),
    );

    expect((await getBillingStatus(clerkId)).premium).toBe(false);
  });

  it.each(["active", "past_due", "incomplete"] as const)(
    "opens management instead of checkout for a %s subscription",
    async (status) => {
      subscriptions = [subscription({ status })];

      await expect(createCheckout(clerkId)).resolves.toEqual({
        url: portalUrl,
      });

      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
      expect(mocks.portalCreate).toHaveBeenCalledOnce();
    },
  );

  it("reuses an open checkout when the user retries", async () => {
    const first = await createCheckout(clerkId);
    const second = await createCheckout(clerkId);

    expect(first).toEqual({ url: checkoutUrl });
    expect(second).toEqual(first);
    expect(mocks.checkoutCreate).toHaveBeenCalledOnce();
    expect(mocks.checkoutRetrieve).toHaveBeenCalledWith("cs_test_open");
  });

  it("uses an idempotency key and omits payment_method_types", async () => {
    await createCheckout(clerkId);

    expect(mocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: customerId,
        client_reference_id: userId,
        mode: "subscription",
        line_items: [{ price: "price_pro_test", quantity: 1 }],
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^stackwing-checkout:test:/),
      }),
    );

    const parameters = mocks.checkoutCreate.mock.calls[0]![0];

    expect(parameters).not.toHaveProperty("payment_method_types");
  });

  it("blocks checkout while another billing operation holds the lock", async () => {
    await database().exec(`
      UPDATE billing_customers
      SET sync_owner = gen_random_uuid(),
          sync_until = now() + interval '2 minutes'
    `);

    await expect(createCheckout(clerkId)).rejects.toMatchObject({
      status: 409,
    });

    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("rejects checkout confirmation for another customer", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(
      completedCheckout({ customer: "cus_someone_else" }),
    );

    await expect(
      confirmCheckout(clerkId, "cs_test_complete"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects checkout confirmation with another user reference", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(
      completedCheckout({
        client_reference_id: "another-user",
      }),
    );

    await expect(
      confirmCheckout(clerkId, "cs_test_complete"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not confirm an unpaid checkout", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(
      completedCheckout({ payment_status: "unpaid" }),
    );

    await expect(
      confirmCheckout(clerkId, "cs_test_complete"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("checks the subscription invoice even after a paid checkout", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(completedCheckout());
    subscriptions = [subscription({ paid: false })];

    const status = await confirmCheckout(clerkId, "cs_test_complete");

    expect(status.premium).toBe(false);
  });

  it("grants access after verified checkout and subscription payment", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(completedCheckout());
    subscriptions = [subscription()];

    const status = await confirmCheckout(clerkId, "cs_test_complete");

    expect(status.premium).toBe(true);
  });

  it("processes the same webhook only once", async () => {
    subscriptions = [subscription()];
    const notification = event("evt_duplicate", "invoice.paid");

    await handleBillingEvent(notification);
    await handleBillingEvent(notification);

    expect(mocks.subscriptionsList).toHaveBeenCalledOnce();

    const result = await database().query<{ count: number }>(
      `
        SELECT count(*)::integer AS count
        FROM billing_events
        WHERE stripe_event_id = $1
      `,
      ["evt_duplicate"],
    );

    expect(result.rows[0]!.count).toBe(1);
  });

  it("uses current Stripe state instead of an old webhook payload", async () => {
    subscriptions = [subscription({ status: "canceled" })];

    await handleBillingEvent(
      event("evt_old_active", "customer.subscription.updated", {
        customer: customerId,
        status: "active",
      }),
    );

    const status = await getBillingStatus(clerkId);

    expect(status.status).toBe("canceled");
    expect(status.premium).toBe(false);
  });

  it("does not mark a failed webhook as processed", async () => {
    subscriptions = [subscription({ customer: "cus_wrong_customer" })];

    await expect(handleBillingEvent(event("evt_retry"))).rejects.toMatchObject({
      status: 503,
    });

    const result = await database().query<{ count: number }>(
      `
        SELECT count(*)::integer AS count
        FROM billing_events
        WHERE stripe_event_id = $1
      `,
      ["evt_retry"],
    );

    expect(result.rows[0]!.count).toBe(0);
  });

  it("does not grant access from a stale billing snapshot", async () => {
    subscriptions = [subscription()];
    await refreshBilling(clerkId);

    await database().exec(`
      UPDATE billing_customers
      SET synced_at = now() - interval '49 hours'
    `);

    expect((await getBillingStatus(clerkId)).premium).toBe(false);
  });

  it("does not grant access while the account has a risk hold", async () => {
    subscriptions = [subscription()];
    await refreshBilling(clerkId);

    await database().exec(`
      UPDATE billing_customers
      SET risk_hold = true
    `);

    const status = await getBillingStatus(clerkId);

    expect(status.blocked).toBe(true);
    expect(status.premium).toBe(false);
  });
});
