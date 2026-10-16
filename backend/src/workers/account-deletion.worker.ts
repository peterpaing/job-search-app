export function startAccountDeletionWorker(): () => void {
  if (process.env.ACCOUNT_DELETION_WORKER_ENABLED !== "true") {
    return () => undefined;
  }

  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) return;

    running = true;

    try {
      const { processPendingAccountDeletions } =
        await import("../services/account-deletion.service.js");

      await processPendingAccountDeletions();
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
