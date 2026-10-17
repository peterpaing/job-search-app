import { rateLimit } from "express-rate-limit";

export function createApiRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,

    skip: (req) => req.method === "OPTIONS",

    handler: (_req, res) => {
      res.setHeader("Cache-Control", "no-store");

      res.status(429).json({
        message: "Too many requests. Please wait a moment and try again.",
      });
    },
  });
}

export function createAiRequestLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,

    skip: (req) => req.method !== "POST",

    // Only mount this AFTER verified authentication.
    keyGenerator: (_req, res) => {
      const userId: unknown = res.locals.clerkUserId;

      if (typeof userId !== "string" || !userId) {
        throw new Error("AI rate limiter requires verified authentication.");
      }

      return `ai:${userId}`;
    },

    handler: (_req, res) => {
      res.setHeader("Cache-Control", "no-store");

      res.status(429).json({
        message: "Too many AI requests. Please wait a moment and try again.",
      });
    },
  });
}
