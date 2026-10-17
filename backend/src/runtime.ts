let shuttingDown = false;
let activeTasks = 0;

const idleWaiters = new Set<() => void>();

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function beginShutdown(): void {
  shuttingDown = true;
}

export async function trackTask<T>(task: () => Promise<T>): Promise<T> {
  activeTasks += 1;

  try {
    return await task();
  } finally {
    activeTasks -= 1;

    if (activeTasks === 0) {
      for (const resolve of idleWaiters) {
        resolve();
      }

      idleWaiters.clear();
    }
  }
}

export function waitForTasks(): Promise<void> {
  if (activeTasks === 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    idleWaiters.add(resolve);
  });
}
