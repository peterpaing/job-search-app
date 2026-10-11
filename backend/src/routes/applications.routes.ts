import { clerkMiddleware, getAuth } from "@clerk/express";
import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";

const jobIdSchema = z.string().trim().min(1).max(512);

const updateSchema = z
  .object({
    status: z
      .enum(["applied", "interviewing", "offered", "rejected"])
      .optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.notes !== undefined, {
    message: "Provide a status or notes",
  });

export function createApplicationsRouter(frontendOrigin: string) {
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
          message: "Sign in to manage applications",
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
      const { getApplications } =
        await import("../services/applications.service.js");

      const records = await getApplications(res.locals.clerkUserId as string);

      res.json({ applications: records });
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
      const { trackApplication } =
        await import("../services/applications.service.js");

      const application = await trackApplication(
        res.locals.clerkUserId as string,
        parsed.data,
      );

      if (!application) {
        res.status(404).json({
          message: "This listing is no longer available to track",
        });
        return;
      }

      res.json({ application });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:jobId", async (req, res, next) => {
    const jobId = jobIdSchema.safeParse(req.params.jobId);
    const update = updateSchema.safeParse(req.body);

    if (!jobId.success || !update.success) {
      res.status(400).json({
        message: "Invalid application update",
      });
      return;
    }

    try {
      const { updateApplication } =
        await import("../services/applications.service.js");

      const application = await updateApplication(
        res.locals.clerkUserId as string,
        jobId.data,
        update.data,
      );

      if (!application) {
        res.status(404).json({ message: "Application not found" });
        return;
      }

      res.json({ application });
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
      const { removeApplication } =
        await import("../services/applications.service.js");

      await removeApplication(res.locals.clerkUserId as string, parsed.data);

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
      message: "Unable to update applications. Please try again.",
    });
  };

  router.use(handleError);

  return router;
}
