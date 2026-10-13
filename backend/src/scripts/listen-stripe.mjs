import "dotenv/config";
import { spawn } from "node:child_process";

const key = process.env.STRIPE_SECRET_KEY?.trim();

if (!key?.startsWith("sk_test_")) {
  console.error("Set a sandbox sk_test_ key in backend/.env first.");
  process.exit(1);
}

const events = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "radar.early_fraud_warning.created",
].join(",");

const listener = spawn(
  "C:\\tools\\stripe\\stripe.exe",
  [
    "listen",
    "--events",
    events,
    "--forward-to",
    "http://localhost:5000/api/billing/webhook",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      STRIPE_API_KEY: key,
    },
  },
);

listener.on("error", () => {
  console.error("Could not start Stripe CLI. Check its installation path.");
  process.exitCode = 1;
});

listener.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
