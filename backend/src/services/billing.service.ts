import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { db } from "../db/index.js";
import { billingCustomers, billingEvents } from "../db/billing.schema.js";
import { getOrCreateUser } from "./users.service.js";
import { BillingError, getBillingConfig, getStripe } from "./billing.config.js";
import {
  getSandboxBillingClock,
  sandboxBillingClockEnabled,
} from "./billing.clock.js";

type Customer = typeof billingCustomers.$inferSelect;

type Snapshot = {
  subscription_id: string;
  price_id: string;
  status: string;
  premium: boolean;
  paid_until: string | null;
  cancel_at_period_end: boolean;
};

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }

  return null;
}

async function customerForUser(clerkUserId: string): Promise<Customer | null> {
  const config = getBillingConfig();

  const result = await db.execute(sql`
    SELECT c.*
    FROM billing_customers c
    JOIN users u ON u.id = c.user_id
    WHERE u.clerk_user_id = ${clerkUserId}
      AND c.livemode = ${config.livemode}
    LIMIT 1
  `);

  const row = result.rows[0];

  if (!row) return null;

  const [customer] = await db
    .select()
    .from(billingCustomers)
    .where(
      eq(billingCustomers.stripeCustomerId, String(row.stripe_customer_id)),
    )
    .limit(1);

  return customer ?? null;
}

async function ensureCustomer(clerkUserId: string): Promise<Customer> {
  const existing = await customerForUser(clerkUserId);

  if (existing) return existing;

  const config = getBillingConfig();
  const user = await getOrCreateUser(clerkUserId);

  const stripeCustomer = await getStripe().customers.create(
    {
      metadata: {
        stackwing_user_id: user.id,
      },
    },
    {
      idempotencyKey: `stackwing-customer:${config.mode}:${user.id}`,
    },
  );

  await db
    .insert(billingCustomers)
    .values({
      userId: user.id,
      livemode: config.livemode,
      stripeCustomerId: stripeCustomer.id,
    })
    .onConflictDoNothing();

  const customer = await customerForUser(clerkUserId);

  if (!customer) {
    throw new BillingError(503, "Could not initialize billing.");
  }

  return customer;
}

async function withCustomerLock<T>(
  customerId: string,
  action: (owner: string) => Promise<T>,
): Promise<T> {
  const owner = randomUUID();

  // Operational leases always use real database time.
  const lease = await db.execute(sql`
    UPDATE billing_customers
    SET sync_owner = ${owner}::uuid,
        sync_until = clock_timestamp() + interval '2 minutes'
    WHERE stripe_customer_id = ${customerId}
      AND (
        sync_until IS NULL
        OR sync_until <= clock_timestamp()
      )
    RETURNING stripe_customer_id
  `);

  if (lease.rows.length === 0) {
    throw new BillingError(
      409,
      "Billing is updating. Please try again in a moment.",
    );
  }

  try {
    return await action(owner);
  } finally {
    await db.execute(sql`
      UPDATE billing_customers
      SET sync_owner = NULL,
          sync_until = NULL
      WHERE stripe_customer_id = ${customerId}
        AND sync_owner = ${owner}::uuid
    `);
  }
}

const invoiceLineSchema = z.object({
  period: z.object({
    start: z.number(),
    end: z.number(),
  }),
  pricing: z
    .object({
      price_details: z.object({ price: z.unknown() }).nullable().optional(),
    })
    .nullable()
    .optional(),

  // Compatibility with older invoice line representations.
  price: z.unknown().optional(),
});

async function paidThrough(
  subscription: Stripe.Subscription,
  nowSeconds: number,
): Promise<string | null> {
  const { priceId } = getBillingConfig();
  const item = subscription.items.data[0];

  if (
    !item ||
    subscription.items.has_more ||
    subscription.items.data.length !== 1 ||
    item.price.id !== priceId ||
    item.quantity !== 1
  ) {
    return null;
  }

  const invoice = subscription.latest_invoice;

  if (!invoice || typeof invoice === "string" || invoice.status !== "paid") {
    return null;
  }

  const lines: Stripe.InvoiceLineItem[] = [];

  if (invoice.lines.has_more) {
    for await (const line of getStripe().invoices.listLineItems(invoice.id, {
      limit: 100,
    })) {
      lines.push(line);

      if (lines.length > 100) {
        throw new BillingError(
          503,
          "This subscription needs a billing review.",
        );
      }
    }
  } else {
    lines.push(...invoice.lines.data);
  }

  let end = 0;
  const now = nowSeconds;

  for (const line of lines) {
    const parsed = invoiceLineSchema.safeParse(line);

    if (!parsed.success) continue;

    const value = parsed.data;
    const linePrice =
      objectId(value.pricing?.price_details?.price) ?? objectId(value.price);

    if (
      linePrice === priceId &&
      value.period.start <= now &&
      value.period.end > now
    ) {
      end = Math.max(end, Math.min(value.period.end, item.current_period_end));
    }
  }

  return end > now ? new Date(end * 1000).toISOString() : null;
}

async function fetchSubscriptions(
  customerId: string,
): Promise<Stripe.Subscription[]> {
  const subscriptions: Stripe.Subscription[] = [];

  for await (const subscription of getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.latest_invoice"],
  })) {
    subscriptions.push(subscription);

    if (subscriptions.length > 100) {
      throw new BillingError(503, "This account needs a billing review.");
    }
  }

  return subscriptions;
}

async function writeSnapshot(
  customerId: string,
  owner: string,
  subscriptions: Stripe.Subscription[],
  eventId: string | null = null,
  riskHold = false,
) {
  const config = getBillingConfig();
  const snapshots: Snapshot[] = [];

  const clock =
    subscriptions.length > 0 ? await getSandboxBillingClock(customerId) : null;

  const nowSeconds = clock?.nowSeconds ?? Math.floor(Date.now() / 1000);

  for (const subscription of subscriptions) {
    if (
      objectId(subscription.customer) !== customerId ||
      subscription.livemode !== config.livemode ||
      (clock !== null && objectId(subscription.test_clock) !== clock.id)
    ) {
      throw new BillingError(503, "Subscription verification failed.");
    }

    const paidUntil = await paidThrough(subscription, nowSeconds);

    const item = subscription.items.data[0];

    snapshots.push({
      subscription_id: subscription.id,
      price_id: item?.price.id ?? "",
      status: subscription.status,
      premium:
        subscription.status === "active" &&
        subscription.pause_collection === null &&
        paidUntil !== null,
      paid_until: paidUntil,

      // Normalize both Stripe cancellation formats.
      // A cancellation beyond this period must not hide renewal.
      cancel_at_period_end:
        subscription.cancel_at_period_end ||
        (subscription.items.data.length === 1 &&
          !subscription.items.has_more &&
          typeof subscription.cancel_at === "number" &&
          typeof item?.current_period_end === "number" &&
          subscription.cancel_at <= item.current_period_end),
    });
  }

  await db.execute(sql`
    SELECT billing_commit_snapshot(
      ${customerId},
      ${owner}::uuid,
      ${JSON.stringify(snapshots)}::jsonb,
      ${eventId}::text,
      ${riskHold}
    )
  `);
}

export async function syncCustomer(
  customerId: string,
  eventId: string | null = null,
  riskHold = false,
) {
  const config = getBillingConfig();

  const [customer] = await db
    .select()
    .from(billingCustomers)
    .where(
      and(
        eq(billingCustomers.stripeCustomerId, customerId),
        eq(billingCustomers.livemode, config.livemode),
      ),
    )
    .limit(1);

  // Ignore events for customers not mapped to this app.
  if (!customer) return;

  await withCustomerLock(customerId, async (owner) => {
    let subscriptions = await fetchSubscriptions(customerId);

    if (riskHold) {
      // Suspend access and stop future renewals.
      for (const subscription of subscriptions) {
        if (
          ["active", "trialing", "past_due"].includes(subscription.status) &&
          !subscription.cancel_at_period_end
        ) {
          await getStripe().subscriptions.update(subscription.id, {
            cancel_at_period_end: true,
          });
        }
      }

      subscriptions = await fetchSubscriptions(customerId);
    }

    await writeSnapshot(customerId, owner, subscriptions, eventId, riskHold);
  });
}

const statusRowSchema = z.object({
  premium: z.boolean(),
  risk_hold: z.boolean(),
  status: z.string().nullable(),
  paid_until: z.string().nullable(),
  cancel_at_period_end: z.boolean().nullable(),
});

export async function getBillingStatus(clerkUserId: string) {
  const config = getBillingConfig();

  let accessTime = sql`now()`;

  if (sandboxBillingClockEnabled()) {
    // Resolve ownership using verified identity.
    const customer = await customerForUser(clerkUserId);

    if (customer) {
      const clock = await getSandboxBillingClock(customer.stripeCustomerId);

      if (clock) {
        accessTime = sql`
          to_timestamp(${clock.nowSeconds}::double precision)
        `;
      }
    }
  }

  const result = await db.execute(sql`
    SELECT
      (
        NOT c.risk_hold
        AND c.synced_at > now() - interval '48 hours'
        AND COALESCE(s.premium, false)
        AND s.price_id = ${config.priceId}
        AND s.paid_until > ${accessTime}
      ) IS TRUE AS premium,
      c.risk_hold,
      s.status,
      s.paid_until::text AS paid_until,
      s.cancel_at_period_end
    FROM billing_customers c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN billing_subscriptions s
      ON s.stripe_customer_id = c.stripe_customer_id
    WHERE u.clerk_user_id = ${clerkUserId}
      AND c.livemode = ${config.livemode}
    ORDER BY s.premium DESC NULLS LAST,
             s.updated_at DESC NULLS LAST
    LIMIT 1
  `);

  const row = result.rows[0] ? statusRowSchema.parse(result.rows[0]) : null;

  return {
    premium: row?.premium ?? false,
    customerExists: row !== null,
    blocked: row?.risk_hold ?? false,
    status: row?.status ?? "none",
    paidUntil: row?.paid_until ? new Date(row.paid_until).toISOString() : null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    mode: config.mode,
    price: {
      amount: 199,
      currency: "usd",
      interval: "month",
    },
  };
}

export async function hasPremium(clerkUserId: string) {
  return (await getBillingStatus(clerkUserId)).premium;
}

async function portalUrl(customerId: string): Promise<string> {
  const config = getBillingConfig();
  const stripe = getStripe();

  const portalConfig = await stripe.billingPortal.configurations.retrieve(
    config.portalConfigurationId,
  );

  if (
    !portalConfig.active ||
    !portalConfig.features.subscription_cancel.enabled ||
    portalConfig.features.subscription_cancel.mode !== "at_period_end" ||
    portalConfig.features.subscription_update.enabled
  ) {
    throw new BillingError(503, "The billing portal needs configuration.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration: config.portalConfigurationId,
    return_url: `${config.frontendOrigin}/billing?returned=portal`,
  });

  return session.url;
}

export async function createPortal(clerkUserId: string) {
  const customer = await customerForUser(clerkUserId);

  if (!customer) {
    throw new BillingError(409, "You do not have a billing account yet.");
  }

  return {
    url: await portalUrl(customer.stripeCustomerId),
  };
}

export async function createCheckout(clerkUserId: string) {
  const config = getBillingConfig();
  const stripe = getStripe();

  const price = await stripe.prices.retrieve(config.priceId);

  if (
    !price.active ||
    price.livemode !== config.livemode ||
    price.currency !== "usd" ||
    price.unit_amount !== 199 ||
    price.billing_scheme !== "per_unit" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.transform_quantity !== null
  ) {
    throw new BillingError(
      503,
      "Configure the Pro price as USD $1.99 per month.",
    );
  }

  const customer = await ensureCustomer(clerkUserId);

  if (customer.riskHold) {
    throw new BillingError(
      403,
      "Your billing account needs review. Please contact support.",
    );
  }

  return withCustomerLock(customer.stripeCustomerId, async (owner) => {
    const subscriptions = await fetchSubscriptions(customer.stripeCustomerId);

    await writeSnapshot(customer.stripeCustomerId, owner, subscriptions);

    const existingSubscription = subscriptions.some(
      (subscription) =>
        !["canceled", "incomplete_expired"].includes(subscription.status),
    );

    if (existingSubscription) {
      return {
        url: await portalUrl(customer.stripeCustomerId),
      };
    }

    const [freshCustomer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.stripeCustomerId, customer.stripeCustomerId))
      .limit(1);

    if (!freshCustomer) {
      throw new BillingError(503, "Billing account is unavailable.");
    }

    if (freshCustomer.checkoutSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        freshCustomer.checkoutSessionId,
      );

      if (existingSession.status === "open" && existingSession.url) {
        return { url: existingSession.url };
      }
    }

    // Checkout reservations always use real time.
    const reusable =
      freshCustomer.checkoutKey &&
      freshCustomer.checkoutExpiresAt &&
      Date.parse(freshCustomer.checkoutExpiresAt) > Date.now() + 60_000;

    const checkoutKey = reusable ? freshCustomer.checkoutKey! : randomUUID();

    const expiresAt = reusable
      ? Math.floor(Date.parse(freshCustomer.checkoutExpiresAt!) / 1000)
      : Math.floor(Date.now() / 1000) + 3600;

    const reservation = await db.execute(sql`
        UPDATE billing_customers
        SET checkout_key = ${checkoutKey}::uuid,
            checkout_expires_at = to_timestamp(${expiresAt}),
            checkout_session_id = NULL,
            consent_at = clock_timestamp()
        WHERE stripe_customer_id = ${customer.stripeCustomerId}
          AND sync_owner = ${owner}::uuid
          AND sync_until > clock_timestamp()
        RETURNING stripe_customer_id
      `);

    if (reservation.rows.length === 0) {
      throw new BillingError(409, "Please retry checkout.");
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customer.stripeCustomerId,
        client_reference_id: customer.userId,
        line_items: [
          {
            price: config.priceId,
            quantity: 1,
          },
        ],
        billing_address_collection: "required",
        customer_update: { address: "auto" },
        automatic_tax: {
          enabled: config.automaticTax,
        },
        allow_promotion_codes: false,
        subscription_data: {
          metadata: {
            stackwing_user_id: customer.userId,
            consent_version: "monthly-subscription-v1",
          },
        },
        expires_at: expiresAt,
        success_url:
          `${config.frontendOrigin}/billing` +
          "?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: `${config.frontendOrigin}/billing` + "?checkout=cancelled",
      },
      {
        idempotencyKey: `stackwing-checkout:${config.mode}:` + checkoutKey,
      },
    );

    await db
      .update(billingCustomers)
      .set({
        checkoutSessionId: session.id,
      })
      .where(
        and(
          eq(billingCustomers.stripeCustomerId, customer.stripeCustomerId),
          eq(billingCustomers.checkoutKey, checkoutKey),
          eq(billingCustomers.syncOwner, owner),
        ),
      );

    if (!session.url) {
      throw new BillingError(503, "Checkout could not be opened.");
    }

    return { url: session.url };
  });
}

export async function refreshBilling(clerkUserId: string) {
  const customer = await customerForUser(clerkUserId);

  if (customer) {
    await syncCustomer(customer.stripeCustomerId);
  }

  return getBillingStatus(clerkUserId);
}

export async function confirmCheckout(clerkUserId: string, sessionId: string) {
  const customer = await customerForUser(clerkUserId);

  if (!customer) {
    throw new BillingError(403, "This checkout is not yours.");
  }

  const session = await getStripe().checkout.sessions.retrieve(sessionId);

  if (
    objectId(session.customer) !== customer.stripeCustomerId ||
    session.client_reference_id !== customer.userId ||
    session.livemode !== customer.livemode ||
    session.mode !== "subscription"
  ) {
    throw new BillingError(403, "This checkout is not yours.");
  }

  if (session.status !== "complete" || session.payment_status !== "paid") {
    throw new BillingError(
      409,
      "Payment is not confirmed yet. Refresh your billing status shortly.",
    );
  }

  // A success URL alone must never grant access.
  await syncCustomer(customer.stripeCustomerId);

  return getBillingStatus(clerkUserId);
}

export async function handleBillingEvent(event: Stripe.Event) {
  const [processed] = await db
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.stripeEventId, event.id))
    .limit(1);

  if (processed) return;

  const object = event.data.object;

  let customerId: string | null = null;
  let riskHold = false;

  if (
    event.type.startsWith("customer.subscription.") ||
    event.type.startsWith("invoice.") ||
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if ("customer" in object) {
      customerId = objectId(object.customer);
    }
  } else if (event.type === "charge.refunded") {
    const charge = object as Stripe.Charge;

    // Partial refunds do not automatically revoke access.
    if (!charge.refunded) return;

    customerId = objectId(charge.customer);
    riskHold = true;
  } else if (
    event.type === "charge.dispute.created" ||
    event.type === "radar.early_fraud_warning.created"
  ) {
    if ("charge" in object) {
      const chargeId = objectId(object.charge);

      if (chargeId) {
        const charge = await getStripe().charges.retrieve(chargeId);

        customerId = objectId(charge.customer);
        riskHold = true;
      }
    }
  } else {
    return;
  }

  if (customerId) {
    await syncCustomer(customerId, event.id, riskHold);
  }
}

export async function reconcileBilling() {
  const config = getBillingConfig();
  let cursor = "";
  let checked = 0;
  let failed = 0;

  for (;;) {
    const customers = await db
      .select()
      .from(billingCustomers)
      .where(
        and(
          eq(billingCustomers.livemode, config.livemode),
          gt(billingCustomers.stripeCustomerId, cursor),
        ),
      )
      .orderBy(billingCustomers.stripeCustomerId)
      .limit(100);

    if (customers.length === 0) break;

    for (let offset = 0; offset < customers.length; offset += 5) {
      await Promise.all(
        customers.slice(offset, offset + 5).map(async (customer) => {
          try {
            await syncCustomer(customer.stripeCustomerId);
            checked += 1;
          } catch {
            failed += 1;

            console.error("Billing reconciliation failed", {
              customerId: customer.stripeCustomerId,
            });
          }
        }),
      );
    }

    cursor = customers[customers.length - 1]!.stripeCustomerId;
  }

  console.log("Billing reconciliation complete", {
    checked,
    failed,
  });

  if (failed > 0) {
    throw new BillingError(503, "Some billing accounts could not synchronize.");
  }
}
