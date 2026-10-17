import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as runtime from "../../runtime.js";

const mocks = vi.hoisted(() => ({
  processPending: vi.fn(),
}));

vi.mock("../../services/account-deletion.service.js", () => ({
  processPendingAccountDeletions: mocks.processPending,
}));

import { startAccountDeletionWorker } from "../../workers/account-deletion.worker.js";

let stops: (() => void)[];

function start() {
  const stop = startAccountDeletionWorker();
  stops.push(stop);
  return stop;
}

async function settleImports() {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

describe("account deletion worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.stubEnv("ACCOUNT_DELETION_WORKER_ENABLED", "true");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.processPending.mockResolvedValue(undefined);
    stops = [];
  });

  afterEach(() => {
    for (const stop of stops) stop();

    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not start when the worker flag is disabled", async () => {
    vi.stubEnv("ACCOUNT_DELETION_WORKER_ENABLED", "false");

    start();
    await vi.advanceTimersByTimeAsync(60_000);
    await settleImports();

    expect(mocks.processPending).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks pending work immediately and every 15 seconds", async () => {
    start();
    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(14_999);
    expect(mocks.processPending).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledTimes(2);
  });

  it("does not overlap a still-running queue check", async () => {
    let release!: () => void;

    mocks.processPending.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    start();
    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(mocks.processPending).toHaveBeenCalledTimes(1);

    release();
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(15_000);
    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledTimes(2);
  });

  it("recovers on a later tick after a queue failure", async () => {
    mocks.processPending.mockRejectedValueOnce(
      new Error("temporary database failure"),
    );

    start();
    await settleImports();

    expect(console.error).toHaveBeenCalledWith(
      "[account-deletion] Retry worker needs attention.",
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledTimes(2);
  });

  it("stops future queue checks when shut down", async () => {
    const stop = start();
    await settleImports();

    stop();

    await vi.advanceTimersByTimeAsync(60_000);
    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not begin queue processing during shutdown", async () => {
    vi.spyOn(runtime, "isShuttingDown").mockReturnValue(true);

    start();

    await vi.advanceTimersByTimeAsync(60_000);
    await settleImports();

    expect(mocks.processPending).not.toHaveBeenCalled();
  });

  it("keeps an active queue task tracked after polling stops", async () => {
    let release!: () => void;

    mocks.processPending.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const stop = start();

    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledOnce();

    let idle = false;

    const waiting = runtime.waitForTasks().then(() => {
      idle = true;
    });

    stop();

    await vi.advanceTimersByTimeAsync(60_000);
    await settleImports();

    expect(mocks.processPending).toHaveBeenCalledOnce();
    expect(idle).toBe(false);

    release();

    await waiting;

    expect(idle).toBe(true);
  });
});
