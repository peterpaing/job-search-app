import { EventEmitter } from "node:events";
import express, { type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createErrorReporter,
  globalErrorHandler,
  requestObservability,
} from "../../middleware/request-observability.middleware.js";

const SECRET = "private-notes-and-credentials";

type LogEntry = {
  event: string;
  requestId: string;
  route: string;
  status: number | null;
  outcome?: string;
  durationMs?: number;
  errorType?: string;
  errorCode?: string | null;
  fingerprint?: string;
};

function infoLogs(): LogEntry[] {
  return vi
    .mocked(console.info)
    .mock.calls.map(([line]) => JSON.parse(String(line)) as LogEntry);
}

function errorLogs(): LogEntry[] {
  return vi
    .mocked(console.error)
    .mock.calls.map(([line]) => JSON.parse(String(line)) as LogEntry);
}

function createApp() {
  const app = express();

  app.use(requestObservability);
  app.use(express.json());

  app.get("/api/ok/:id", async (_req, res) => {
    await Promise.resolve();
    res.json({ ok: true });
  });

  app.post("/api/fail/:id", () => {
    const cause = Object.assign(new Error(SECRET), {
      code: "23505",
      detail: SECRET,
    });

    throw new Error(SECRET, { cause });
  });

  app.use(createErrorReporter("applications"));
  app.use(globalErrorHandler);

  return app;
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("request observability", () => {
  it("generates a request ID and records one completion event", async () => {
    const response = await request(createApp()).get("/api/ok/example");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const logs = infoLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual(
      expect.objectContaining({
        event: "http_request",
        requestId: response.headers["x-request-id"],
        route: "/api/ok/:id",
        status: 200,
        outcome: "completed",
        durationMs: expect.any(Number),
      }),
    );

    expect(logs[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("does not trust a client-supplied request ID", async () => {
    const suppliedId = "11111111-1111-4111-8111-111111111111";

    const response = await request(createApp())
      .get("/api/ok/example")
      .set("X-Request-ID", suppliedId);

    expect(response.headers["x-request-id"]).not.toBe(suppliedId);
  });

  it("keeps concurrent requests separate", async () => {
    const app = createApp();

    const responses = await Promise.all([
      request(app).get("/api/ok/one"),
      request(app).get("/api/ok/two"),
    ]);

    const ids = responses.map((response) => response.headers["x-request-id"]);

    expect(new Set(ids).size).toBe(2);

    const loggedIds = infoLogs().map((entry) => entry.requestId);

    expect(new Set(loggedIds)).toEqual(new Set(ids));
  });

  it("logs safe diagnostics without bodies, headers, queries, or raw errors", async () => {
    const response = await request(createApp())
      .post(`/api/fail/${SECRET}?token=${SECRET}`)
      .set("Authorization", `Bearer ${SECRET}`)
      .set("Cookie", `session=${SECRET}`)
      .send({ notes: SECRET });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Internal server error. Please try again.",
    });

    const errors = errorLogs();

    // The router reporter and global handler must not duplicate the error.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(
      expect.objectContaining({
        event: "http_error",
        requestId: response.headers["x-request-id"],
        route: "/api/fail/:id",
        status: 500,
        errorType: "Error",
        errorCode: "23505",
        fingerprint: expect.stringMatching(/^[0-9a-f]{24}$/),
      }),
    );

    expect(
      JSON.stringify({
        errors,
        requests: infoLogs(),
        response: response.body,
      }),
    ).not.toContain(SECRET);
  });

  it("returns a safe parser error with a request ID", async () => {
    const response = await request(createApp())
      .post("/api/fail/example")
      .set("Content-Type", "application/json")
      .send(`{"notes":"${SECRET}"`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: "Invalid request.",
    });
    expect(response.headers["x-request-id"]).toBeTruthy();

    const warnings = vi
      .mocked(console.warn)
      .mock.calls.map(([line]) => JSON.parse(String(line)) as LogEntry);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual(
      expect.objectContaining({
        event: "http_error",
        status: 400,
        requestId: response.headers["x-request-id"],
      }),
    );

    expect(errorLogs()).toHaveLength(0);
    expect(JSON.stringify(warnings)).not.toContain(SECRET);
    expect(infoLogs()[0]?.status).toBe(400);
  });

  it("does not log raw paths for unmatched routes", async () => {
    const response = await request(createApp()).get(
      `/api/unknown/${SECRET}?token=${SECRET}`,
    );

    expect(response.status).toBe(404);
    expect(infoLogs()[0]?.route).toBe("/api:unmatched");
    expect(JSON.stringify(infoLogs())).not.toContain(SECRET);
  });

  it("records an aborted response only once", () => {
    const req = {
      method: "GET",
      baseUrl: "",
      path: "/api/jobs",
    } as Request;

    const res = Object.assign(new EventEmitter(), {
      headersSent: false,
      statusCode: 200,
      writableFinished: false,
      setHeader: vi.fn(),
    }) as unknown as Response;

    const next = vi.fn();

    requestObservability(req, res, next);

    res.emit("close");
    res.emit("finish");

    expect(next).toHaveBeenCalledOnce();
    expect(infoLogs()).toHaveLength(1);
    expect(infoLogs()[0]).toEqual(
      expect.objectContaining({
        event: "http_request",
        status: null,
        outcome: "aborted",
      }),
    );
  });
});
