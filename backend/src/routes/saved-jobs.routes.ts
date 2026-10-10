import { clerkMiddleware, getAuth } from "@clerk/express";
import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";

const jobIdSchema = z.string().trim().min(1).max(512);

export function createSavedJobsRouter(frontendOrigin: string) {
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.use(
    clerkMiddleware({
      authorizedParties: [frontendOrigin],
    }),
  );

  router.use((req, res, next) => {
    try {
      const auth = getAuth(req, {
        acceptsToken: "session_token",
        treatPendingAsSignedOut: true,
      });

      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({
          message: "Sign in to manage saved jobs",
        });
        return;
      }

      res.locals.clerkUserId = auth.userId;
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (_req, res, next) => {
    try {
      const { getSavedJobs } =
        await import("../services/saved-jobs.service.js");

      const saved = await getSavedJobs(res.locals.clerkUserId as string);

      res.json({ jobs: saved });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:jobId", async (req, res, next) => {
    const parsed = jobIdSchema.safeParse(req.params.jobId);

    if (!parsed.success) {
      res.status(400).json({ message: "Invalid job ID" });
      return;
    }

    try {
      const { saveJob } = await import("../services/saved-jobs.service.js");

      const savedJob = await saveJob(
        res.locals.clerkUserId as string,
        parsed.data,
      );

      if (!savedJob) {
        res.status(404).json({ message: "Job not found" });
        return;
      }

      res.json({ savedJob });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:jobId", async (req, res, next) => {
    const parsed = jobIdSchema.safeParse(req.params.jobId);

    if (!parsed.success) {
      res.status(400).json({ message: "Invalid job ID" });
      return;
    }

    try {
      const { unsaveJob } = await import("../services/saved-jobs.service.js");

      await unsaveJob(res.locals.clerkUserId as string, parsed.data);

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(500).json({
      message: "Unable to update saved jobs. Please try again.",
    });
  };

  router.use(handleError);

  return router;
}
