import { clerkMiddleware, getAuth } from "@clerk/express";
import { reverificationError } from "@clerk/backend/internal";
import { Router } from "express";
import { z } from "zod";

export function createAccountDeletionRouter(frontendOrigin: string) {
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

  router.post("/deletion", async (req, res) => {
    try {
      const auth = getAuth(req, {
        acceptsToken: "session_token",
        treatPendingAsSignedOut: true,
      });

      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ message: "Sign in to delete your account." });
        return;
      }

      if (auth.actor) {
        res.status(403).json({
          message: "Account deletion is not allowed during impersonation.",
        });
        return;
      }

      if (req.get("origin") !== frontendOrigin) {
        res.status(403).json({ message: "Invalid request origin." });
        return;
      }

      const parsed = z
        .object({ confirmation: z.literal("DELETE") })
        .strict()
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Type DELETE to confirm permanent account deletion.",
        });
        return;
      }

      if (!auth.has({ reverification: "strict" })) {
        res.status(403).json(reverificationError("strict"));
        return;
      }

      const { requestAccountDeletion } =
        await import("../services/account-deletion.service.js");

      const result = await requestAccountDeletion(auth.userId);

      res.status(result.status === "completed" ? 200 : 202).json(result);
    } catch (error) {
      const { AccountDeletionError } =
        await import("../services/account-deletion.state.js");

      res
        .status(error instanceof AccountDeletionError ? error.status : 503)
        .json({
          message:
            error instanceof AccountDeletionError
              ? error.message
              : "Unable to confirm your deletion request. Please try again.",
        });
    }
  });

  return router;
}
