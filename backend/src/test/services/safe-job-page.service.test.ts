import { EventEmitter } from "node:events";
import type {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
} from "node:http";
import type { RequestOptions } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: mocks.lookup,
}));

vi.mock("node:https", () => ({
  request: mocks.request,
}));

import { readJobPage } from "../../services/safe-job-page.service.js";

type Plan = {
  status?: number;
  headers?: IncomingHttpHeaders;
  chunks?: Buffer[];
  interrupted?: boolean;
  error?: Error;
  hold?: boolean;
};

let plans: Plan[];
let timeout: AbortController;

function queue(plan: Plan = {}) {
  plans.push(plan);
}

describe("safe job-page reader", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    timeout = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);

    plans = [];
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);

    mocks.request.mockImplementation(
      (
        _url: URL,
        options: RequestOptions,
        callback: (response: IncomingMessage) => void,
      ) => {
        const plan = plans.shift();

        if (!plan) {
          throw new Error("Missing mocked HTTPS response");
        }

        const req = new EventEmitter() as EventEmitter & {
          end: () => void;
        };

        const onAbort = () => {
          req.emit("error", new Error("Listing request timed out"));
        };

        options.signal?.addEventListener("abort", onAbort, {
          once: true,
        });

        req.end = () => {
          queueMicrotask(() => {
            if (options.signal?.aborted) {
              onAbort();
              return;
            }

            if (plan.hold) return;

            if (plan.error) {
              options.signal?.removeEventListener("abort", onAbort);
              req.emit("error", plan.error);
              return;
            }

            let destroyed = false;
            const response = Object.assign(new EventEmitter(), {
              statusCode: plan.status ?? 200,
              headers: plan.headers ?? {},
              destroy: vi.fn(() => {
                destroyed = true;
              }),
            });

            callback(response as unknown as IncomingMessage);

            if (!destroyed && plan.interrupted) {
              response.emit("aborted");
            } else if (!destroyed) {
              for (const chunk of plan.chunks ?? [
                Buffer.from("<html>Job listing</html>"),
              ]) {
                if (destroyed) break;
                response.emit("data", chunk);
              }

              if (!destroyed) response.emit("end");
            }

            options.signal?.removeEventListener("abort", onAbort);
          });
        };

        return req as unknown as ClientRequest;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads HTTPS HTML using the validated DNS address", async () => {
    queue();

    await expect(readJobPage("https://jobs.example.com/role")).resolves.toEqual(
      {
        status: 200,
        html: "<html>Job listing</html>",
      },
    );

    expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith("jobs.example.com", {
      all: true,
      verbatim: true,
    });

    const options = mocks.request.mock.calls[0][1] as RequestOptions;

    expect(options).toMatchObject({
      method: "GET",
      agent: false,
      family: 4,
      servername: "jobs.example.com",
      headers: {
        "Accept-Encoding": "identity",
      },
    });

    const callback = vi.fn();

    options.lookup!("jobs.example.com", { all: true }, callback);

    expect(callback).toHaveBeenCalledWith(null, [
      { address: "8.8.8.8", family: 4 },
    ]);

    // The pinned lookup does not perform another DNS request.
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
  });

  it.each([
    "http://jobs.example.com/role",
    "https://jobs.example.com:8443/role",
    "https://name:password@jobs.example.com/role",
    "https://127.0.0.1/role",
    "https://[::1]/role",
    "https://localhost/role",
    "https://jobs.local/role",
    "https://jobs.internal/role",
    "https://jobs.localhost/role",
    "https://jobs.example.com./role",
  ])("rejects unsafe URLs before DNS: %s", async (url) => {
    await expect(readJobPage(url)).rejects.toThrow("Unsafe listing URL");

    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "fc00::1",
  ])("rejects restricted DNS answers: %s", async (address) => {
    mocks.lookup.mockResolvedValue([
      {
        address,
        family: address.includes(":") ? 6 : 4,
      },
    ]);

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "restricted address",
    );

    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects mixed public and private DNS answers", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "restricted address",
    );

    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects an empty DNS answer", async () => {
    mocks.lookup.mockResolvedValue([]);

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "no public address",
    );
  });

  it("propagates DNS failure without making an HTTPS request", async () => {
    mocks.lookup.mockRejectedValue(new Error("DNS unavailable"));

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "DNS unavailable",
    );

    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("validates each redirect independently", async () => {
    queue({
      status: 302,
      headers: { location: "https://other.example.com/role" },
    });
    queue({ chunks: [Buffer.from("Redirected job")] });

    await expect(readJobPage("https://jobs.example.com/role")).resolves.toEqual(
      {
        status: 200,
        html: "Redirected job",
      },
    );

    expect(mocks.lookup).toHaveBeenNthCalledWith(2, "other.example.com", {
      all: true,
      verbatim: true,
    });
  });

  it("blocks a redirect to a private DNS address", async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);

    queue({
      status: 302,
      headers: { location: "https://internal.example.com/role" },
    });

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "restricted address",
    );

    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a literal private IP", async () => {
    queue({
      status: 302,
      headers: { location: "https://127.0.0.1/private" },
    });

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "Unsafe listing URL",
    );

    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("follows relative redirects", async () => {
    queue({
      status: 302,
      headers: { location: "/new-role" },
    });
    queue();

    await readJobPage("https://jobs.example.com/old-role");

    expect(String(mocks.request.mock.calls[1][0])).toBe(
      "https://jobs.example.com/new-role",
    );
  });

  it("rejects redirects without a location", async () => {
    queue({ status: 302 });

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "redirect limit",
    );
  });

  it("limits redirect chains", async () => {
    for (let index = 0; index < 4; index += 1) {
      queue({
        status: 302,
        headers: { location: `/redirect-${index}` },
      });
    }

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "redirect limit",
    );

    expect(mocks.request).toHaveBeenCalledTimes(4);
  });

  it("returns non-200 status without interpreting its body", async () => {
    queue({
      status: 404,
      chunks: [Buffer.from("Not a job listing")],
    });

    await expect(readJobPage("https://jobs.example.com/role")).resolves.toEqual(
      {
        status: 404,
        html: "",
      },
    );
  });

  it("rejects unsupported compressed responses", async () => {
    queue({
      headers: { "content-encoding": "gzip" },
    });

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "Unsupported listing compression",
    );
  });

  it("rejects responses larger than 512 KiB", async () => {
    queue({
      chunks: [
        Buffer.alloc(256 * 1024, "a"),
        Buffer.alloc(256 * 1024 + 1, "b"),
      ],
    });

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "Listing response too large",
    );
  });

  it("rejects interrupted responses", async () => {
    queue({ interrupted: true });

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "Listing response interrupted",
    );
  });

  it("rejects HTTPS request errors", async () => {
    queue({ error: new Error("Connection unavailable") });

    await expect(readJobPage("https://jobs.example.com/role")).rejects.toThrow(
      "Connection unavailable",
    );
  });

  it("times out a stalled DNS lookup", async () => {
    mocks.lookup.mockImplementation(() => new Promise<never>(() => undefined));

    const result = readJobPage("https://jobs.example.com/role");
    const assertion = expect(result).rejects.toThrow(
      "Listing lookup timed out",
    );

    timeout.abort();

    await assertion;
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("times out a stalled HTTPS request", async () => {
    queue({ hold: true });

    const result = readJobPage("https://jobs.example.com/role");
    const assertion = expect(result).rejects.toThrow(
      "Listing request timed out",
    );

    await vi.waitFor(() => {
      expect(mocks.request).toHaveBeenCalledTimes(1);
    });

    timeout.abort();

    await assertion;
  });
});
