import express from "express";
import cors from "cors";
import { router } from "./routes/jobs.routes.js";
import { createUsersRouter } from "./routes/users.routes.js";
import { createSavedJobsRouter } from "./routes/saved-jobs.routes.js";

const app = express();

const frontendOrigin = new URL(
  process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
).origin;

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

app.use("/api", router);
app.use("/api/users", createUsersRouter(frontendOrigin));
app.use("/api/saved-jobs", createSavedJobsRouter(frontendOrigin));

export default app;
