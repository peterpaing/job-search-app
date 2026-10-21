export class SmartMatchRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SmartMatchRequestError";
  }
}

export async function readAnswerStream<T>(
  response: Response,
  onDelta: (delta: string) => void,
  ensureCurrent: () => void,
): Promise<T> {
  if (!response.body) {
    throw new Error("SmartMatch couldn’t complete this request.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let receivedBytes = 0;

  function consumeLine(line: string): { result: T } | undefined {
    if (!line.trim()) {
      return;
    }

    const event: unknown = JSON.parse(line);

    if (typeof event !== "object" || event === null || !("type" in event)) {
      throw new Error("SmartMatch couldn’t complete this request.");
    }

    if (
      event.type === "delta" &&
      "delta" in event &&
      typeof event.delta === "string"
    ) {
      onDelta(event.delta);
      return;
    }

    if (
      event.type === "done" &&
      "result" in event &&
      typeof event.result === "object" &&
      event.result !== null &&
      "answer" in event.result &&
      typeof event.result.answer === "string" &&
      "cached" in event.result &&
      typeof event.result.cached === "boolean" &&
      "usage" in event.result
    ) {
      return { result: event.result as T };
    }

    if (event.type === "error") {
      const status =
        "status" in event && typeof event.status === "number"
          ? event.status
          : 502;

      const message =
        "message" in event && typeof event.message === "string"
          ? event.message
          : "AI couldn’t complete this request. Please try again later.";

      throw new SmartMatchRequestError(status, message);
    }

    throw new Error("SmartMatch couldn’t complete this request.");
  }

  try {
    while (true) {
      const chunk = await reader.read();
      ensureCurrent();

      if (chunk.done) {
        buffer += decoder.decode();
      } else {
        receivedBytes += chunk.value.byteLength;

        if (receivedBytes > 2_000_000) {
          throw new Error("SmartMatch couldn’t complete this request.");
        }

        buffer += decoder.decode(chunk.value, { stream: true });
      }

      let newline = buffer.indexOf("\n");

      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);

        const completed = consumeLine(line);

        if (completed) {
          return completed.result;
        }

        newline = buffer.indexOf("\n");
      }

      if (chunk.done) {
        if (buffer.trim()) {
          const completed = consumeLine(buffer);

          if (completed) {
            return completed.result;
          }
        }

        throw new Error(
          "AI couldn’t complete this request. Please try again later.",
        );
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function waitForAccessRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Access check cancelled.", "AbortError"));
      return;
    }

    function cancel() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);

      reject(new DOMException("Access check cancelled.", "AbortError"));
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 1500);

    signal.addEventListener("abort", cancel, {
      once: true,
    });
  });
}

export async function readVerifiedSmartMatchAccess<T>(
  read: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal.aborted) {
      throw new DOMException("Access check cancelled.", "AbortError");
    }

    try {
      return await read();
    } catch (failure) {
      if (signal.aborted) {
        throw failure;
      }

      const retryable =
        failure instanceof SmartMatchRequestError
          ? failure.status === 409 ||
            failure.status === 429 ||
            failure.status >= 500
          : failure instanceof TypeError ||
            (failure instanceof DOMException && failure.name === "AbortError");

      if (!retryable || attempt === 3) {
        throw failure;
      }

      await waitForAccessRetry(signal);
    }
  }

  throw new Error("Your subscription could not be verified. Please try again.");
}
