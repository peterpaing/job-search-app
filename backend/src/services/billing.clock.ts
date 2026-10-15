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
  // Never retrieve simulated time for live or disabled environments.
  if (!sandboxBillingClockEnabled()) return null;

  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);

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

  // Ordinary test customers continue using real time.
  if (!reference) return null;

  const clockId = typeof reference === "string" ? reference : reference.id;

  const clock = await stripe.testHelpers.testClocks.retrieve(clockId);

  if (
    clock.id !== clockId ||
    clock.livemode !== false ||
    !Number.isSafeInteger(clock.frozen_time) ||
    clock.frozen_time <= 0
  ) {
    throw new BillingError(
      503,
      "The sandbox billing clock could not be verified.",
    );
  }

  // Avoid committing a snapshot while simulated objects are changing.
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
