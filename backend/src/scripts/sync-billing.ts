import "dotenv/config";
import { BillingError } from "../services/billing.config.js";

async function main() {
  const requiredSettings = [
    "DATABASE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_PORTAL_CONFIGURATION_ID",
  ];

  const missing = requiredSettings.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    console.error(`Missing GitHub Actions settings: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const { reconcileBilling } = await import("../services/billing.service.js");

  await reconcileBilling();
}

try {
  await main();
} catch (error) {
  if (error instanceof BillingError) {
    console.error(`Billing synchronization failed: ${error.message}`);
  } else {
    console.error("Billing synchronization failed.", {
      errorType: error instanceof Error ? error.name : "Unknown",
    });
  }

  process.exitCode = 1;
}
