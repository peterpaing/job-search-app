import { Router } from "express";
import { sql } from "drizzle-orm";
import { isShuttingDown } from "../runtime.js";
import { reportRequestError } from "../middleware/request-observability.middleware.js";

export function createHealthRouter() {
  const router = Router();

  let lastSuccessAt = 0;
  let pendingProbe: Promise<void> | undefined;

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/live", (_req, res) => {
    res.json({ status: "alive" });
  });

  router.get("/ready", async (req, res) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: "not_ready" });
      return;
    }

    // Avoid a database query for every simultaneous health request.
    if (Date.now() - lastSuccessAt < 5_000) {
      res.json({ status: "ready" });
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      if (!pendingProbe) {
        pendingProbe = (async () => {
          const { db } = await import("../db/index.js");

          await db.execute(sql`SELECT 1`);

          lastSuccessAt = Date.now();
        })().finally(() => {
          pendingProbe = undefined;
        });
      }

      await Promise.race([
        pendingProbe,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error("Readiness probe timed out."));
          }, 2_000);
        }),
      ]);

      if (isShuttingDown()) {
        res.status(503).json({ status: "not_ready" });
        return;
      }

      res.json({ status: "ready" });
    } catch (error) {
      reportRequestError(req, res, error, "readiness", 503);

      res.status(503).json({ status: "not_ready" });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  });

  return router;
}
