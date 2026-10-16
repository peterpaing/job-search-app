import { setTimeout as delay } from "node:timers/promises";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { Router, type ErrorRequestHandler, type RequestHandler } from "express";
import { z } from "zod";
import {
  BillingBusyError,
  BillingError,
  verifyStripeEvent,
} from "../services/billing.config.js";

// Five processing attempts, with four short waits.
// Only lock contention is retried inside this request.
const webhookRetryDelays = [250, 500, 1000, 2000];

export const stripeWebhook: RequestHandler = async (req, res) => {
  const signature = req.get("stripe-signature");

  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({
      message: "Invalid webhook request.",
    });
    return;
  }

  let event;

  try {
    event = verifyStripeEvent(req.body, signature);
  } catch (error) {
    res.status(error instanceof BillingError ? error.status : 400).json({
      message:
        error instanceof BillingError
          ? error.message
          : "Invalid webhook signature.",
    });

    return;
  }

  try {
    const { handleBillingEvent } =
      await import("../services/billing.service.js");

    for (let attempt = 0; ; attempt += 1) {
      try {
        // Each retry keeps the original event ID.
        // Already-processed events remain protected by
        // the service's existing idempotency check.
        await handleBillingEvent(event);
        break;
      } catch (error) {
        const waitMilliseconds = webhookRetryDelays[attempt];

        if (
          !(error instanceof BillingBusyError) ||
          waitMilliseconds === undefined
        ) {
          throw error;
        }

        await delay(waitMilliseconds);
      }
    }

    // Acknowledge only after processing succeeds.
    res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      type: event.type,
      errorKind:
        error instanceof BillingBusyError
          ? "BillingBusyError"
          : error instanceof BillingError
            ? "BillingError"
            : "UnexpectedError",
      billingStatus: error instanceof BillingError ? error.status : null,
      message:
        error instanceof BillingError
          ? error.message
          : "Unexpected processing failure; raw details omitted.",
    });

    // Keep unsuccessful processing retryable.
    res.status(503).json({
      message: "Webhook processing needs a retry.",
    });
  }
};

export function createBillingRouter(frontendOrigin: string) {
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
        res.status(401).json({ message: "Sign in to manage billing." });
        return;
      }

      res.locals.clerkUserId = auth.userId;
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/status", async (_req, res, next) => {
    try {
      const service = await import("../services/billing.service.js");

      res.json(
        await service.getBillingStatus(res.locals.clerkUserId as string),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/checkout", async (req, res, next) => {
    const parsed = z
      .object({ consent: z.literal(true) })
      .strict()
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Confirm the monthly subscription terms first.",
      });
      return;
    }

    try {
      const service = await import("../services/billing.service.js");

      res.json(await service.createCheckout(res.locals.clerkUserId as string));
    } catch (error) {
      next(error);
    }
  });

  router.post("/portal", async (_req, res, next) => {
    try {
      const service = await import("../services/billing.service.js");

      res.json(await service.createPortal(res.locals.clerkUserId as string));
    } catch (error) {
      next(error);
    }
  });

  router.post("/refresh", async (_req, res, next) => {
    try {
      const service = await import("../services/billing.service.js");

      res.json(await service.refreshBilling(res.locals.clerkUserId as string));
    } catch (error) {
      next(error);
    }
  });

  router.post("/confirm", async (req, res, next) => {
    const parsed = z
      .object({
        sessionId: z.string().startsWith("cs_").max(255),
      })
      .strict()
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ message: "Invalid checkout session." });
      return;
    }

    try {
      const service = await import("../services/billing.service.js");

      res.json(
        await service.confirmCheckout(
          res.locals.clerkUserId as string,
          parsed.data.sessionId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(error instanceof BillingError ? error.status : 503).json({
      message:
        error instanceof BillingError
          ? error.message
          : "Billing is temporarily unavailable. Please try again.",
    });
  };

  router.use(handleError);

  return router;
}
