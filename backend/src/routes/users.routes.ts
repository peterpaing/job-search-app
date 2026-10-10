import { Router, type ErrorRequestHandler } from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";

export function createUsersRouter(frontendOrigin: string) {
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

  router.post("/me", async (req, res, next) => {
    try {
      const auth = getAuth(req, {
        acceptsToken: "session_token",
        treatPendingAsSignedOut: true,
      });

      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({
          message: "Sign in to access your account",
        });
        return;
      }

      // Load the database service only for authenticated requests.
      const { getOrCreateUser } = await import("../services/users.service.js");

      const user = await getOrCreateUser(auth.userId);

      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  });

  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    // Do not send internal errors or credentials to the client.
    res.status(500).json({
      message: "Unable to load your account. Please try again.",
    });
  };

  router.use(handleError);

  return router;
}
