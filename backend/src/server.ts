import "dotenv/config";

import app from "./app.js";
import { beginShutdown, waitForTasks } from "./runtime.js";
import { startAccountDeletionWorker } from "./workers/account-deletion.worker.js";

const port = Number(process.env.PORT ?? 5000);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid port number.");
}

const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? "25000");

if (
  !Number.isSafeInteger(shutdownTimeoutMs) ||
  shutdownTimeoutMs < 1_000 ||
  shutdownTimeoutMs > 290_000
) {
  throw new Error("SHUTDOWN_TIMEOUT_MS must be between 1000 and 290000.");
}

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

const stopDeletionWorker = startAccountDeletionWorker();

server.on("close", stopDeletionWorker);

let shutdownStarted = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;

  console.log(`[shutdown] Received ${signal}.`);

  beginShutdown();
  stopDeletionWorker();

  // Keep this timer referenced so the deadline still applies
  // if only unresolved promises remain.
  const deadline = setTimeout(() => {
    console.error(
      "[shutdown] Deadline reached. Durable jobs will recover on retry.",
    );

    server.closeAllConnections();
    process.exit(1);
  }, shutdownTimeoutMs);

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });

      server.closeIdleConnections();
    });

    // Includes AI work after a client disconnect and
    // account deletion continuing after its HTTP response.
    await waitForTasks();

    clearTimeout(deadline);

    console.log("[shutdown] Active work drained.");
    process.exit(0);
  } catch {
    clearTimeout(deadline);

    console.error("[shutdown] Unable to finish shutdown cleanly.");

    server.closeAllConnections();
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

server.on("error", (error) => {
  console.error("[server] Startup or listener failure.", {
    code: (error as NodeJS.ErrnoException).code,
  });

  void shutdown("server-error");
});
