import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

const children = new Set<ChildProcess>();

function moduleUrl(source: string): string {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function startHarness() {
  const source = await readFile(
    new URL("../server.ts", import.meta.url),
    "utf8",
  );

  const appModule = moduleUrl(`
    export default {
      listen(_port, _host, callback) {
        const server = globalThis.__shutdownHarness.server;
        queueMicrotask(callback);
        return server;
      }
    };
  `);

  const runtimeModule = moduleUrl(`
    export function beginShutdown() {
      process.send("begin");
    }

    export function waitForTasks() {
      process.send("waiting-for-tasks");
      return globalThis.__shutdownHarness.tasks;
    }
  `);

  const workerModule = moduleUrl(`
    export function startAccountDeletionWorker() {
      return () => process.send("worker-stopped");
    }
  `);

  let transformed = source;

  const replacements: [string, string][] = [
    ['import "dotenv/config";', ""],
    ['"./app.js"', JSON.stringify(appModule)],
    ['"./runtime.js"', JSON.stringify(runtimeModule)],
    ['"./workers/account-deletion.worker.js"', JSON.stringify(workerModule)],
  ];

  for (const [from, to] of replacements) {
    if (!transformed.includes(from)) {
      throw new Error(
        `Shutdown harness needs updating: source no longer contains ${from}`,
      );
    }

    transformed = transformed.replace(from, to);
  }

  const compiled = ts.transpileModule(transformed, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;

  const harness = `
    import { EventEmitter } from "node:events";

    let finishHttp;
    let finishTasks;

    const fakeServer = new EventEmitter();

    fakeServer.close = (callback) => {
      finishHttp = callback;
      process.send("http-closing");
    };

    fakeServer.closeIdleConnections = () => {
      process.send("idle-connections-closed");
    };

    fakeServer.closeAllConnections = () => {
      process.send("all-connections-closed");
    };

    globalThis.__shutdownHarness = {
      server: fakeServer,
      tasks: new Promise((resolve) => {
        finishTasks = resolve;
      })
    };

    process.on("message", (command) => {
      if (command === "shutdown") {
        process.emit("SIGTERM");
      }

      if (command === "http-done") {
        finishHttp?.();
      }

      if (command === "tasks-done") {
        finishTasks();
      }

      if (command === "listener-error") {
        fakeServer.emit("error", Object.assign(
          new Error("Listener failed"),
          { code: "EADDRINUSE" }
        ));
      }
    });

    ${compiled}

    process.send("ready");
  `;

  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", harness],
    {
      env: {
        ...process.env,
        PORT: "5000",
        SHUTDOWN_TIMEOUT_MS: "1000",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );

  children.add(child);

  const messages: string[] = [];
  let output = "";

  child.stdout?.on("data", (chunk) => {
    output += String(chunk);
  });

  child.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });

  child.on("message", (message) => {
    if (typeof message === "string") {
      messages.push(message);
    }
  });

  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });

  async function waitForMessage(expected: string) {
    const started = Date.now();

    while (!messages.includes(expected)) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Child exited before ${expected}:\n${output}`);
      }

      if (Date.now() - started > 5_000) {
        throw new Error(`Timed out waiting for ${expected}:\n${output}`);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
  }

  await waitForMessage("ready");

  return {
    child,
    messages,
    exited,
    waitForMessage,
    output: () => output,
    send: (command: string) => {
      child.send(command);
    },
  };
}

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      });

      child.kill("SIGKILL");
      await stopped;
    }
  }

  children.clear();
});

describe("server shutdown", () => {
  it("stops polling and waits for HTTP and background tasks", async () => {
    const harness = await startHarness();

    harness.send("shutdown");

    await harness.waitForMessage("http-closing");

    expect(harness.messages).toContain("begin");
    expect(harness.messages).toContain("worker-stopped");
    expect(harness.child.exitCode).toBeNull();

    harness.send("http-done");

    await harness.waitForMessage("waiting-for-tasks");

    expect(harness.child.exitCode).toBeNull();

    harness.send("tasks-done");

    expect(await harness.exited).toBe(0);
    expect(harness.output()).toContain("Active work drained.");
  }, 15_000);

  it("forces exit at the deadline when work does not drain", async () => {
    const harness = await startHarness();

    harness.send("shutdown");

    expect(await harness.exited).toBe(1);
    expect(harness.messages).toContain("all-connections-closed");
    expect(harness.output()).toContain("Deadline reached.");
  }, 15_000);

  it("does not start shutdown twice for repeated signals", async () => {
    const harness = await startHarness();

    harness.send("shutdown");
    harness.send("shutdown");

    await harness.waitForMessage("http-closing");

    harness.send("http-done");

    await harness.waitForMessage("waiting-for-tasks");

    harness.send("tasks-done");

    expect(await harness.exited).toBe(0);

    expect(
      harness.messages.filter((message) => message === "begin"),
    ).toHaveLength(1);

    expect(
      harness.messages.filter((message) => message === "http-closing"),
    ).toHaveLength(1);
  }, 15_000);
});
