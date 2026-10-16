import Stripe from "stripe";

export class BillingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export class BillingBusyError extends BillingError {
  constructor() {
    super(409, "Billing is updating. Please try again in a moment.");

    this.name = "BillingBusyError";
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new BillingError(503, "Billing is not configured yet.");
  }

  return value;
}

export function getBillingConfig() {
  const mode = process.env.BILLING_MODE ?? "test";

  if (mode !== "test" && mode !== "live") {
    throw new BillingError(503, "Billing configuration needs attention.");
  }

  const livemode = mode === "live";
  const secretKey = required("STRIPE_SECRET_KEY");

  const validPrefix = livemode ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;

  if (!validPrefix.test(secretKey)) {
    throw new BillingError(503, "Stripe key and billing mode do not match.");
  }

  if (livemode && process.env.BILLING_LIVE_ENABLED !== "true") {
    throw new BillingError(503, "Live payments are not enabled.");
  }

  const frontendOrigin = new URL(
    process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  ).origin;

  if (livemode && !frontendOrigin.startsWith("https://")) {
    throw new BillingError(503, "Live billing requires HTTPS.");
  }

  return {
    mode,
    livemode,
    secretKey,
    frontendOrigin,
    priceId: required("STRIPE_PRO_PRICE_ID"),
    portalConfigurationId: required("STRIPE_PORTAL_CONFIGURATION_ID"),
    automaticTax: process.env.BILLING_AUTOMATIC_TAX === "true",
  };
}

let cached: { key: string; client: Stripe } | undefined;

export function getStripe(): Stripe {
  const { secretKey } = getBillingConfig();

  if (!cached || cached.key !== secretKey) {
    cached = {
      key: secretKey,
      client: new Stripe(secretKey, {
        timeout: 10_000,
        maxNetworkRetries: 1,
      }),
    };
  }

  return cached.client;
}

export function verifyStripeEvent(
  body: Buffer,
  signature: string,
): Stripe.Event {
  const config = getBillingConfig();

  const event = getStripe().webhooks.constructEvent(
    body,
    signature,
    required("STRIPE_WEBHOOK_SECRET"),
  );

  if (event.livemode !== config.livemode) {
    throw new BillingError(400, "Webhook billing mode does not match.");
  }

  return event;
}
