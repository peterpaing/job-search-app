import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAnswerStream,
  readVerifiedSmartMatchAccess,
  SmartMatchRequestError,
} from "../../app/lib/smart-match.transport";

const answer = {
  answer: "A completed answer",
  cached: false,
  usage: { used: 1 },
};

const encoder = new TextEncoder();

function streamResponse(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }

        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson",
      },
    },
  );
}

function textResponse(text: string) {
  return streamResponse([encoder.encode(text)]);
}

describe("SmartMatch answer stream", () => {
  it("handles fragmented lines and UTF-8 characters", async () => {
    const text =
      `${JSON.stringify({ type: "delta", delta: "café" })}\n` +
      `${JSON.stringify({ type: "done", result: answer })}\n`;

    const bytes = encoder.encode(text);
    const split = bytes.indexOf(0xc3) + 1;

    const onDelta = vi.fn();
    const ensureCurrent = vi.fn();

    const result = await readAnswerStream(
      streamResponse([
        bytes.slice(0, split),
        bytes.slice(split, split + 5),
        bytes.slice(split + 5),
      ]),
      onDelta,
      ensureCurrent,
    );

    expect(result).toEqual(answer);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith("café");
    expect(ensureCurrent).toHaveBeenCalled();
  });

  it("accepts a final completion event without a trailing newline", async () => {
    await expect(
      readAnswerStream(
        textResponse(JSON.stringify({ type: "done", result: answer })),
        vi.fn(),
        vi.fn(),
      ),
    ).resolves.toEqual(answer);
  });

  it("rejects a stream that ends without a completion event", async () => {
    await expect(
      readAnswerStream(
        textResponse(
          `${JSON.stringify({ type: "delta", delta: "Partial" })}\n`,
        ),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toThrow(
      "AI couldn’t complete this request. Please try again later.",
    );
  });

  it("preserves server error status and message", async () => {
    await expect(
      readAnswerStream(
        textResponse(
          `${JSON.stringify({
            type: "error",
            status: 503,
            message: "AI is temporarily unavailable.",
          })}\n`,
        ),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      name: "SmartMatchRequestError",
      status: 503,
      message: "AI is temporarily unavailable.",
    });
  });

  it("does not deliver deltas after the account becomes invalid", async () => {
    const onDelta = vi.fn();

    const ensureCurrent = vi.fn(() => {
      throw new Error("Your account changed. Please try again.");
    });

    await expect(
      readAnswerStream(
        textResponse(
          `${JSON.stringify({ type: "delta", delta: "Private" })}\n`,
        ),
        onDelta,
        ensureCurrent,
      ),
    ).rejects.toThrow("Your account changed. Please try again.");

    expect(onDelta).not.toHaveBeenCalled();
  });

  it("rejects streams exceeding the existing byte limit", async () => {
    await expect(
      readAnswerStream(
        streamResponse([new Uint8Array(2_000_001)]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toThrow("SmartMatch couldn’t complete this request.");
  });

  it("rejects malformed JSON", async () => {
    await expect(
      readAnswerStream(textResponse("{invalid}\n"), vi.fn(), vi.fn()),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it("rejects responses without a readable body", async () => {
    await expect(
      readAnswerStream(new Response(null), vi.fn(), vi.fn()),
    ).rejects.toThrow("SmartMatch couldn’t complete this request.");
  });
});

describe("SmartMatch access retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a temporary failure and then returns verified access", async () => {
    const access = { premium: true };

    const read = vi
      .fn<() => Promise<typeof access>>()
      .mockRejectedValueOnce(new SmartMatchRequestError(503, "Temporary"))
      .mockResolvedValueOnce(access);

    const pending = readVerifiedSmartMatchAccess(
      read,
      new AbortController().signal,
    );

    const assertion = expect(pending).resolves.toEqual(access);

    await vi.runAllTimersAsync();
    await assertion;

    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stops after four failed attempts", async () => {
    const failure = new SmartMatchRequestError(503, "Unavailable");
    const read = vi.fn<() => Promise<unknown>>().mockRejectedValue(failure);

    const pending = readVerifiedSmartMatchAccess(
      read,
      new AbortController().signal,
    );

    const assertion = expect(pending).rejects.toBe(failure);

    await vi.runAllTimersAsync();
    await assertion;

    expect(read).toHaveBeenCalledTimes(4);
  });

  it("does not retry a confirmed forbidden response", async () => {
    const failure = new SmartMatchRequestError(403, "Access ended");
    const read = vi.fn<() => Promise<unknown>>().mockRejectedValue(failure);

    await expect(
      readVerifiedSmartMatchAccess(read, new AbortController().signal),
    ).rejects.toBe(failure);

    expect(read).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start an already-cancelled access check", async () => {
    const controller = new AbortController();
    controller.abort();

    const read = vi.fn<() => Promise<unknown>>();

    await expect(
      readVerifiedSmartMatchAccess(read, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(read).not.toHaveBeenCalled();
  });

  it("cancels a pending retry without sending another request", async () => {
    const controller = new AbortController();

    const read = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new SmartMatchRequestError(503, "Temporary"));

    const pending = readVerifiedSmartMatchAccess(read, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });

    // Allow the failed first attempt to enter its retry wait.
    await Promise.resolve();
    await Promise.resolve();

    controller.abort();

    await assertion;

    expect(read).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
