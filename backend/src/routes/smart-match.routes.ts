import { clerkMiddleware, getAuth } from "@clerk/express";
import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import {
  SmartMatchError,
  getSmartMatchConfig,
  profileSchema,
} from "../services/smart-match.logic.js";
import { BillingError } from "../services/billing.config.js";
import { accountDeletionGuard } from "../middleware/account-deletion.middleware.js";
import { createAiRequestLimiter } from "../middleware/rate-limit.middleware.js";

const extractSchema = z
  .object({
    resumeText: z.string().trim().min(40).max(16_000),
    consent: z.literal(true),
  })
  .strict();

const questionSchema = z
  .object({
    jobId: z.string().trim().min(1).max(512),
    question: z.string().trim().min(3).max(600),
  })
  .strict();

export function createSmartMatchRouter(frontendOrigin: string) {
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
  router.use(accountDeletionGuard);
  router.use((req, res, next) => {
    try {
      const auth = getAuth(req, {
        acceptsToken: "session_token",
        treatPendingAsSignedOut: true,
      });

      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ message: "Sign in to use SmartMatch." });
        return;
      }

      res.locals.clerkUserId = auth.userId;
      next();
    } catch (error) {
      next(error);
    }
  });
  router.use(["/extract", "/ask"], createAiRequestLimiter());
  router.get("/bootstrap", async (_req, res, next) => {
    try {
      const config = getSmartMatchConfig();
      const clerkUserId = res.locals.clerkUserId as string;

      const { hasSmartMatchAccess: hasPremium } =
        await import("../services/smart-match.owner.js");

      const access = {
        premium: await hasPremium(clerkUserId),
        aiEnabled: config.enabled,
        dailyLimit: config.userDailyLimit,
      };

      if (!access.premium) {
        res.json({
          access,
          profile: null,
          usage: null,
          matches: [],
          searched: 0,
        });
        return;
      }

      const { getSmartMatchBootstrap } =
        await import("../services/smart-match-bootstrap.service.js");

      res.json({
        access,
        ...(await getSmartMatchBootstrap(clerkUserId)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/access", async (_req, res, next) => {
    try {
      const config = getSmartMatchConfig();
      const { hasSmartMatchAccess: hasPremium } =
        await import("../services/smart-match.owner.js");

      res.json({
        premium: await hasPremium(res.locals.clerkUserId as string),
        aiEnabled: config.enabled,
        dailyLimit: config.userDailyLimit,
      });
    } catch (error) {
      next(error);
    }
  });
  // Authentication and account-deletion checks already ran above.
  // Removing a user's own data must not require a paid subscription.
  router.delete("/profile", async (_req, res, next) => {
    try {
      const service = await import("../services/smart-match.service.js");

      res.json(
        await service.storeSmartMatchProfile(
          res.locals.clerkUserId as string,
          null,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  // Keep all other SmartMatch operations protected by Pro.

  router.use(async (_req, res, next) => {
    try {
      const { hasSmartMatchAccess: hasPremium } =
        await import("../services/smart-match.owner.js");

      if (!(await hasPremium(res.locals.clerkUserId as string))) {
        res.status(403).json({
          message: "An active, paid StackWing Pro subscription is required.",
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/profile", async (_req, res, next) => {
    try {
      const service = await import("../services/smart-match.service.js");

      res.json(
        await service.getSmartMatchState(res.locals.clerkUserId as string),
      );
    } catch (error) {
      next(error);
    }
  });

  router.put("/profile", async (req, res, next) => {
    const parsed = profileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message:
          "Add 1–20 skills, no more than 5 roles, and valid preferences.",
      });
      return;
    }

    try {
      const service = await import("../services/smart-match.service.js");

      res.json(
        await service.storeSmartMatchProfile(
          res.locals.clerkUserId as string,
          parsed.data,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/matches", async (_req, res, next) => {
    try {
      const service = await import("../services/smart-match.service.js");

      res.json(
        await service.getSmartMatchJobs(res.locals.clerkUserId as string),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/extract", async (req, res, next) => {
    const parsed = extractSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message:
          "Provide 40–16,000 characters of resume text and confirm consent.",
      });
      return;
    }

    try {
      const service = await import("../services/smart-match.service.js");

      res.json(
        await service.extractSmartMatchProfile(
          res.locals.clerkUserId as string,
          parsed.data.resumeText,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/ask", async (req, res, next) => {
    const parsed = questionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Choose a job and enter a question of 3–600 characters.",
      });
      return;
    }

    const streaming =
      req.get("accept")?.includes("application/x-ndjson") === true;

    function writeEvent(event: unknown) {
      if (res.destroyed || res.writableEnded) {
        return;
      }

      if (!res.headersSent) {
        res.status(200);
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
      }

      res.write(`${JSON.stringify(event)}\n`);
    }

    try {
      const service = await import("../services/smart-match.service.js");

      const result = await service.answerSmartMatchQuestion(
        res.locals.clerkUserId as string,
        parsed.data.jobId,
        parsed.data.question,
        streaming ? (delta) => writeEvent({ type: "delta", delta }) : undefined,
      );

      if (streaming) {
        writeEvent({ type: "done", result });

        if (!res.destroyed && !res.writableEnded) {
          res.end();
        }

        return;
      }

      res.json(result);
    } catch (error) {
      if (!res.headersSent) {
        next(error);
        return;
      }

      writeEvent({
        type: "error",
        status:
          error instanceof SmartMatchError || error instanceof BillingError
            ? error.status
            : 500,
        message:
          error instanceof SmartMatchError || error instanceof BillingError
            ? error.message
            : "AI couldn’t complete this request. Please try again later.",
      });

      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    }
  });

  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof SmartMatchError || error instanceof BillingError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    res.status(500).json({
      message: "SmartMatch couldn’t load. Please try again.",
    });
  };

  router.use(handleError);

  return router;
}
// Keep all other SmartMatch operations protected by Pro.
