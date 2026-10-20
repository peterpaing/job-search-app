import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  ErrorRequestHandler,
  Request,
  RequestHandler,
  Response,
} from "express";

type Operation =
  | "jobs"
  | "users"
  | "saved_jobs"
  | "applications"
  | "billing"
  | "billing_webhook"
  | "smart_match"
  | "smart_match_stream"
  | "account_deletion"
  | "account_verification"
  | "readiness"
  | "unhandled";

type RequestContext = {
  requestId: string;
  startedAt: number;
  scope: string;
  errorLogged: boolean;
};

const contexts = new WeakMap<Response, RequestContext>();

const knownErrorNames = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "AbortError",
  "TimeoutError",
  "ZodError",
  "DrizzleQueryError",
  "NeonDbError",
  "BillingError",
  "BillingBusyError",
  "SmartMatchError",
  "AccountDeletionError",
]);

const approvedErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "08000",
  "08001",
  "08006",
  "23502",
  "23503",
  "23505",
  "23514",
  "28P01",
  "3D000",
  "40001",
  "40P01",
  "42703",
  "42P01",
  "53300",
  "57014",
  "57P01",
]);

function readField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function requestScope(req: Request): string {
  const path = `${req.baseUrl}${req.path}`;

  const accountRoute = path.match(
    /^\/api\/(users|saved-jobs|applications|smart-match|billing|account)(?:\/|$)/,
  );

  if (accountRoute) {
    return `/api/${accountRoute[1]}`;
  }

  if (/^\/health(?:\/|$)/.test(path)) {
    return "/health";
  }

  if (/^\/api(?:\/|$)/.test(path)) {
    return "/api";
  }

  return "other";
}

function contextFor(req: Request, res: Response): RequestContext {
  const existing = contexts.get(res);

  if (existing) {
    return existing;
  }

  const context: RequestContext = {
    requestId: randomUUID(),
    startedAt: performance.now(),
    scope: requestScope(req),
    errorLogged: false,
  };

  contexts.set(res, context);

  if (!res.headersSent) {
    res.setHeader("X-Request-ID", context.requestId);
  }

  return context;
}

function routeLabel(req: Request, context: RequestContext): string {
  const path: unknown = req.route?.path;

  if (typeof path !== "string") {
    return `${context.scope}:unmatched`;
  }

  if (context.scope === "other") {
    return "other:matched";
  }

  if (path === context.scope || path.startsWith(`${context.scope}/`)) {
    return path;
  }

  return `${context.scope}${path}`;
}

function methodLabel(req: Request): string {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
    req.method,
  )
    ? req.method
    : "OTHER";
}

function errorDetails(error: unknown) {
  const name = readField(error, "name");

  const errorType =
    typeof name === "string" && knownErrorNames.has(name)
      ? name
      : "UnknownError";

  let errorCode: string | null = null;
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    const code = readField(current, "code");

    if (typeof code === "string" && approvedErrorCodes.has(code)) {
      errorCode = code;
      break;
    }

    current = readField(current, "cause");
  }

  const stack = readField(error, "stack");

  // Hash diagnostic details rather than writing raw exception text.
  const fingerprint = createHash("sha256")
    .update(
      typeof stack === "string"
        ? stack.slice(0, 16_384)
        : `${errorType}:${errorCode ?? "unknown"}`,
    )
    .digest("hex")
    .slice(0, 24);

  return { errorType, errorCode, fingerprint };
}

function errorStatus(error: unknown, fallback: number): number {
  const status = readField(error, "status");

  return typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
    ? status
    : fallback;
}

export const requestObservability: RequestHandler = (req, res, next) => {
  const context = contextFor(req, res);
  let logged = false;

  function recordCompletion(aborted: boolean) {
    if (logged) {
      return;
    }

    logged = true;

    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "http_request",
        requestId: context.requestId,
        method: methodLabel(req),
        route: routeLabel(req, context),
        status: aborted ? null : res.statusCode,
        outcome: aborted ? "aborted" : "completed",
        durationMs: Math.max(
          0,
          Math.round(performance.now() - context.startedAt),
        ),
      }),
    );
  }

  res.once("finish", () => recordCompletion(false));
  res.once("close", () => recordCompletion(!res.writableFinished));

  next();
};

export function reportRequestError(
  req: Request,
  res: Response,
  error: unknown,
  operation: Operation,
  status = 500,
): void {
  const context = contextFor(req, res);

  if (context.errorLogged) {
    return;
  }

  context.errorLogged = true;

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: status >= 500 ? "error" : "warn",
    event: "http_error",
    requestId: context.requestId,
    method: methodLabel(req),
    route: routeLabel(req, context),
    operation,
    status,
    ...errorDetails(error),
  });

  if (status >= 500) {
    console.error(line);
  } else {
    console.warn(line);
  }
}

export function createErrorReporter(
  operation: Operation,
  fallbackStatus = 500,
): ErrorRequestHandler {
  return (error, req, res, next) => {
    reportRequestError(
      req,
      res,
      error,
      operation,
      errorStatus(error, fallbackStatus),
    );

    next(error);
  };
}

export const globalErrorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
) => {
  const status = errorStatus(error, 500);

  reportRequestError(req, res, error, "unhandled", status);

  if (res.headersSent) {
    // The response cannot be replaced after streaming has started.
    // Close without passing raw exception details to the default handler.
    res.destroy();
    return;
  }

  res.status(status).json({
    message:
      status >= 500
        ? "Internal server error. Please try again."
        : "Invalid request.",
  });
};
