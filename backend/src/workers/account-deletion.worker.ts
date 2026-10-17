import { isShuttingDown, trackTask } from "../runtime.js";

export function startAccountDeletionWorker(): () => void {
  if (process.env.ACCOUNT_DELETION_WORKER_ENABLED !== "true") {
    return () => undefined;
  }

  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped || isShuttingDown()) {
      return;
    }

    running = true;

    try {
      await trackTask(async () => {
        const { processPendingAccountDeletions } =
          await import("../services/account-deletion.service.js");

        if (stopped || isShuttingDown()) {
          return;
        }

        await processPendingAccountDeletions();
      });
    } catch {
      console.error("[account-deletion] Retry worker needs attention.");
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, 15_000);

  timer.unref();
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
