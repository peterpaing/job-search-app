import { BillingError, getBillingConfig, getStripe } from "./billing.config.js";

type SandboxBillingClock = {
  id: string;
  nowSeconds: number;
};

export function sandboxBillingClockEnabled(): boolean {
  const config = getBillingConfig();

  return (
    config.mode === "test" &&
    !config.livemode &&
    process.env.NODE_ENV !== "production" &&
    process.env.BILLING_SANDBOX_CLOCK_ENABLED === "true"
  );
}

export async function getSandboxBillingClock(
  customerId: string,
): Promise<SandboxBillingClock | null> {
  if (!sandboxBillingClockEnabled()) {
    return null;
  }

  const stripe = getStripe();

  // Retrieve the customer and its clock together.
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["test_clock"],
  });

  if (
    customer.deleted ||
    customer.id !== customerId ||
    customer.livemode !== false
  ) {
    throw new BillingError(
      503,
      "The sandbox billing customer could not be verified.",
    );
  }

  const reference = customer.test_clock;

  if (!reference) {
    return null;
  }

  // Normally Stripe returns the expanded object.
  // Keep compatibility if it returns only an ID.
  const clock =
    typeof reference === "string"
      ? await stripe.testHelpers.testClocks.retrieve(reference)
      : reference;

  const expectedId = typeof reference === "string" ? reference : reference.id;

  if (
    clock.id !== expectedId ||
    clock.livemode !== false ||
    !Number.isSafeInteger(clock.frozen_time) ||
    clock.frozen_time <= 0
  ) {
    throw new BillingError(
      503,
      "The sandbox billing clock could not be verified.",
    );
  }

  if (clock.status !== "ready") {
    throw new BillingError(
      503,
      "The sandbox simulation is updating. Wait until it finishes, then refresh billing.",
    );
  }

  return {
    id: clock.id,
    nowSeconds: clock.frozen_time,
  };
}
