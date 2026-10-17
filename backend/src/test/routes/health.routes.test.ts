import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  shuttingDown: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: { execute: mocks.execute },
}));

vi.mock("../../runtime.js", () => ({
  isShuttingDown: mocks.shuttingDown,
}));

import { createHealthRouter } from "../../routes/health.routes.js";

let app: ReturnType<typeof express>;

beforeEach(() => {
  vi.resetAllMocks();

  mocks.execute.mockResolvedValue({ rows: [{ value: 1 }] });
  mocks.shuttingDown.mockReturnValue(false);

  app = express();
  app.use("/health", createHealthRouter());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("health endpoints", () => {
  it("reports liveness without querying the database", async () => {
    const result = await request(app).get("/health/live");

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "alive" });
    expect(result.headers["cache-control"]).toBe("no-store");

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("reports readiness when the database responds", async () => {
    const result = await request(app).get("/health/ready");

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "ready" });
    expect(result.headers["cache-control"]).toBe("no-store");

    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("does not expose database error details", async () => {
    mocks.execute.mockRejectedValue(
      new Error("Sensitive database connection details"),
    );

    const result = await request(app).get("/health/ready");

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ status: "not_ready" });
    expect(result.text).not.toContain("Sensitive");
  });

  it("can recover after a failed probe", async () => {
    mocks.execute
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({ rows: [] });

    expect((await request(app).get("/health/ready")).status).toBe(503);
    expect((await request(app).get("/health/ready")).status).toBe(200);

    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("reuses a recent successful probe, then checks again", async () => {
    let now = Date.UTC(2026, 9, 18);

    vi.spyOn(Date, "now").mockImplementation(() => now);

    expect((await request(app).get("/health/ready")).status).toBe(200);

    now += 4_999;

    expect((await request(app).get("/health/ready")).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledOnce();

    now += 1;

    expect((await request(app).get("/health/ready")).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("shares a pending database probe between concurrent requests", async () => {
    let release!: () => void;

    mocks.execute.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    // Calling .then starts each Supertest request immediately.
    const first = request(app)
      .get("/health/ready")
      .then((result) => result);

    const second = request(app)
      .get("/health/ready")
      .then((result) => result);

    try {
      await vi.waitFor(() => {
        expect(mocks.execute).toHaveBeenCalledOnce();
      });

      release();

      const results = await Promise.all([first, second]);

      expect(results.map((result) => result.status)).toEqual([200, 200]);
      expect(mocks.execute).toHaveBeenCalledOnce();
    } finally {
      release?.();
      await Promise.allSettled([first, second]);
    }
  });

  it("returns 503 when a database probe times out", async () => {
    let release!: () => void;

    mocks.execute.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    try {
      const first = await request(app).get("/health/ready");

      expect(first.status).toBe(503);
      expect(first.body).toEqual({ status: "not_ready" });

      // A timeout must not start unlimited replacement queries.
      const second = await request(app).get("/health/ready");

      expect(second.status).toBe(503);
      expect(mocks.execute).toHaveBeenCalledOnce();
    } finally {
      release?.();
      await Promise.resolve();
    }
  }, 10_000);

  it("reports not-ready during shutdown without querying the database", async () => {
    mocks.shuttingDown.mockReturnValue(true);

    const result = await request(app).get("/health/ready");

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ status: "not_ready" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not report ready if shutdown starts during a probe", async () => {
    let release!: () => void;

    mocks.execute.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const resultPromise = request(app)
      .get("/health/ready")
      .then((result) => result);

    try {
      await vi.waitFor(() => {
        expect(mocks.execute).toHaveBeenCalledOnce();
      });

      mocks.shuttingDown.mockReturnValue(true);
      release();

      const result = await resultPromise;

      expect(result.status).toBe(503);
      expect(result.body).toEqual({ status: "not_ready" });
    } finally {
      release?.();
      await Promise.allSettled([resultPromise]);
    }
  });
});
