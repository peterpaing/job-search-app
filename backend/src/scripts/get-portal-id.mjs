import "dotenv/config";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();

if (!key) {
  console.error("STRIPE_SECRET_KEY is missing from backend/.env");
  process.exit(1);
}

const stripe = new Stripe(key, {
  timeout: 15_000,
  maxNetworkRetries: 0,
});

try {
  const result = await stripe.billingPortal.configurations.list({
    is_default: true,
    active: true,
    limit: 1,
  });

  const id = result.data[0]?.id;

  console.log(
    id
      ? `STRIPE_PORTAL_CONFIGURATION_ID=${id}`
      : "Save your customer portal settings in the same sandbox first.",
  );
} catch {
  console.error(
    "Could not read the portal ID. Check your internet connection, sandbox secret key, and saved portal settings.",
  );
  process.exitCode = 1;
}
