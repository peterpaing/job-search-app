import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const accountDeletionGuard: RequestHandler = async (req, res, next) => {
  try {
    const auth = getAuth(req, {
      acceptsToken: "session_token",
      treatPendingAsSignedOut: true,
    });

    if (!auth.isAuthenticated || !auth.userId) {
      next();
      return;
    }

    const { assertAccountActive, AccountDeletionError } =
      await import("../services/account-deletion.state.js");

    try {
      await assertAccountActive(auth.userId);
    } catch (error) {
      if (error instanceof AccountDeletionError) {
        res.status(error.status).json({ message: error.message });
        return;
      }

      throw error;
    }

    next();
  } catch {
    // Fail closed when deletion state cannot be checked.
    res.status(503).json({
      message: "Account verification is temporarily unavailable.",
    });
  }
};
