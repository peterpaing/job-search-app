import express from "express";
import cors from "cors";
import { router } from "./routes/jobs.routes.js";
import { createUsersRouter } from "./routes/users.routes.js";
import { createSavedJobsRouter } from "./routes/saved-jobs.routes.js";
import { createApplicationsRouter } from "./routes/applications.routes.js";
import { createSmartMatchRouter } from "./routes/smart-match.routes.js";
import { createBillingRouter, stripeWebhook } from "./routes/billing.routes.js";
import { createAccountDeletionRouter } from "./routes/account-deletion.routes.js";

const app = express();

const frontendOrigin = new URL(
  process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
).origin;

app.use(cors({ origin: frontendOrigin }));

app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhook,
);

app.use(express.json({ limit: "100kb" }));
app.use("/api/account", createAccountDeletionRouter(frontendOrigin));

app.use("/api", router);
app.use("/api/users", createUsersRouter(frontendOrigin));
app.use("/api/saved-jobs", createSavedJobsRouter(frontendOrigin));
app.use("/api/applications", createApplicationsRouter(frontendOrigin));
app.use("/api/smart-match", createSmartMatchRouter(frontendOrigin));
app.use("/api/billing", createBillingRouter(frontendOrigin));

export default app;
