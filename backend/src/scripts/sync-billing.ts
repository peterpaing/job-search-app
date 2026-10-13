import "dotenv/config";
import { reconcileBilling } from "../services/billing.service.js";

try {
  await reconcileBilling();
} catch {
  console.error("Billing synchronization did not complete.");
  process.exitCode = 1;
}
