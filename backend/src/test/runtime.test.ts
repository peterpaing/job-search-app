import { beforeEach, describe, expect, it, vi } from "vitest";

let runtime: typeof import("../runtime.js");

beforeEach(async () => {
  vi.resetModules();
  runtime = await import("../runtime.js");
});

describe("backend runtime", () => {
  it("starts outside shutdown and marks shutdown idempotently", () => {
    expect(runtime.isShuttingDown()).toBe(false);

    runtime.beginShutdown();
    runtime.beginShutdown();

    expect(runtime.isShuttingDown()).toBe(true);
  });

  it("resolves immediately when no tasks are running", async () => {
    await expect(runtime.waitForTasks()).resolves.toBeUndefined();
  });

  it("returns the task result", async () => {
    await expect(runtime.trackTask(async () => "finished")).resolves.toBe(
      "finished",
    );

    await expect(runtime.waitForTasks()).resolves.toBeUndefined();
  });

  it("waits for every task, including multiple waiters", async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;

    const first = runtime.trackTask(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );

    const second = runtime.trackTask(
      () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
    );

    let firstWaiterDone = false;
    let secondWaiterDone = false;

    const firstWaiter = runtime.waitForTasks().then(() => {
      firstWaiterDone = true;
    });

    const secondWaiter = runtime.waitForTasks().then(() => {
      secondWaiterDone = true;
    });

    try {
      finishFirst();
      await first;

      expect(firstWaiterDone).toBe(false);
      expect(secondWaiterDone).toBe(false);

      finishSecond();

      await Promise.all([second, firstWaiter, secondWaiter]);

      expect(firstWaiterDone).toBe(true);
      expect(secondWaiterDone).toBe(true);
    } finally {
      finishFirst();
      finishSecond();

      await Promise.allSettled([first, second]);
    }
  });

  it("releases tracking after a rejected task", async () => {
    const error = new Error("Task failed");

    await expect(
      runtime.trackTask(async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    await expect(runtime.waitForTasks()).resolves.toBeUndefined();
  });

  it("releases tracking after a synchronous throw", async () => {
    await expect(
      runtime.trackTask(() => {
        throw new Error("Synchronous failure");
      }),
    ).rejects.toThrow("Synchronous failure");

    await expect(runtime.waitForTasks()).resolves.toBeUndefined();
  });

  it("tracks nested background tasks", async () => {
    let finishBackground!: () => void;

    let background: Promise<void> | undefined;

    await runtime.trackTask(async () => {
      background = runtime.trackTask(
        () =>
          new Promise<void>((resolve) => {
            finishBackground = resolve;
          }),
      );
    });

    let idle = false;

    const waiting = runtime.waitForTasks().then(() => {
      idle = true;
    });

    await Promise.resolve();
    expect(idle).toBe(false);

    finishBackground();

    await background;
    await waiting;

    expect(idle).toBe(true);
  });
});
