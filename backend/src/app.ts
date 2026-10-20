import express from "express";
import cors from "cors";

import { router } from "./routes/jobs.routes.js";
import { createUsersRouter } from "./routes/users.routes.js";
import { createSavedJobsRouter } from "./routes/saved-jobs.routes.js";
import { createApplicationsRouter } from "./routes/applications.routes.js";
import { createSmartMatchRouter } from "./routes/smart-match.routes.js";
import { createBillingRouter, stripeWebhook } from "./routes/billing.routes.js";
import { createAccountDeletionRouter } from "./routes/account-deletion.routes.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { createApiRateLimiter } from "./middleware/rate-limit.middleware.js";
import { isShuttingDown } from "./runtime.js";
import {
  globalErrorHandler,
  requestObservability,
} from "./middleware/request-observability.middleware.js";

const app = express();

app.disable("x-powered-by");
app.use(requestObservability);

// Leave unset locally.
//
// In production, configure ONLY the actual trusted proxy addresses/CIDRs.
// Do not use `true` or blindly trust client-provided forwarding headers.
const trustedProxies = process.env.TRUSTED_PROXY_CIDRS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (trustedProxies?.length) {
  app.set("trust proxy", trustedProxies);
}

const frontendOrigin = new URL(
  process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
).origin;

app.use(
  cors({
    origin: frontendOrigin,
    exposedHeaders: [
      "Retry-After",
      "RateLimit",
      "RateLimit-Policy",
      "X-Request-ID",
    ],
  }),
);

// Health checks are not rate-limited.
app.use("/health", createHealthRouter());

// Reject NEW work during shutdown.
// Requests that already passed this middleware continue normally.
app.use((_req, res, next) => {
  if (isShuttingDown()) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "5");

    res.status(503).json({
      message: "The service is restarting. Please try again shortly.",
    });
    return;
  }

  next();
});

// Keep Stripe outside ordinary user/IP rate limits.
// Signature verification and existing processing retries remain unchanged.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhook,
);

app.use("/api", createApiRateLimiter());

app.use(express.json({ limit: "100kb" }));

app.use("/api/account", createAccountDeletionRouter(frontendOrigin));

app.use("/api", router);
app.use("/api/users", createUsersRouter(frontendOrigin));
app.use("/api/saved-jobs", createSavedJobsRouter(frontendOrigin));
app.use("/api/applications", createApplicationsRouter(frontendOrigin));
app.use("/api/smart-match", createSmartMatchRouter(frontendOrigin));
app.use("/api/billing", createBillingRouter(frontendOrigin));
app.use(globalErrorHandler);
export default app;
