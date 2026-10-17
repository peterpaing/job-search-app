import { describe, expect, it, vi } from "vitest";
import { readSmartMatchStream } from "../../services/smart-match.stream.js";

const encoder = new TextEncoder();

function event(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function delta(text: string, itemId = "msg_test") {
  return event({
    type: "response.output_text.delta",
    delta: text,
    item_id: itemId,
    output_index: 0,
    content_index: 0,
  });
}

function responseFrom(chunks: string[], contentType = "text/event-stream") {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": contentType } },
  );
}

const terminal = {
  id: "resp_test",
  status: "completed",
  usage: {
    input_tokens: 10,
    output_tokens: 20,
    total_tokens: 30,
  },
};

function completed() {
  return event({
    type: "response.completed",
    response: terminal,
  });
}

describe("SmartMatch stream parser", () => {
  it("emits answer text before the terminal event arrives", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;

    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );

    const onDelta = vi.fn();
    const onTerminal = vi.fn();

    const reading = readSmartMatchStream(response, onDelta, onTerminal);

    controller.enqueue(
      encoder.encode(delta('{"scope":"job_related","answer":"Hello')),
    );

    await vi.waitFor(() => {
      expect(onDelta).toHaveBeenCalledWith("Hello");
    });
    expect(onTerminal).not.toHaveBeenCalled();

    controller.enqueue(encoder.encode(delta(' world"}')));
    controller.enqueue(encoder.encode(completed()));
    controller.close();

    await expect(reading).resolves.toEqual(terminal);
    expect(onDelta.mock.calls.map(([text]) => text).join("")).toBe(
      "Hello world",
    );
    expect(onTerminal).toHaveBeenCalledExactlyOnceWith(terminal);
  });

  it("handles SSE lines split across arbitrary chunks", async () => {
    const input =
      delta('{"scope":"job_related","answer":"React"}') + completed();

    const chunks = Array.from(input);

    const onDelta = vi.fn();

    await expect(
      readSmartMatchStream(responseFrom(chunks), onDelta, vi.fn()),
    ).resolves.toEqual(terminal);

    expect(onDelta.mock.calls.map(([text]) => text).join("")).toBe("React");
  });

  it("handles CRLF events and a terminal event without a final newline", async () => {
    const input =
      delta('{"scope":"job_related","answer":"Hello"}') + completed().trimEnd();

    const onDelta = vi.fn();

    await expect(
      readSmartMatchStream(
        responseFrom([input.replaceAll("\n", "\r\n")]),
        onDelta,
        vi.fn(),
      ),
    ).resolves.toEqual(terminal);

    expect(onDelta).toHaveBeenCalledWith("Hello");
  });

  it("decodes split escape sequences without exposing JSON", async () => {
    const onDelta = vi.fn();

    const response = responseFrom([
      delta('{"scope":"job_related","answer":"Line\\'),
      delta('n\\"quoted\\" \\uD83D'),
      delta('\\uDE00"}'),
      completed(),
    ]);

    await readSmartMatchStream(response, onDelta, vi.fn());

    expect(onDelta.mock.calls.map(([text]) => text).join("")).toBe(
      'Line\n"quoted" 😀',
    );
  });

  it("handles UTF-8 characters split between byte chunks", async () => {
    const bytes = encoder.encode(
      delta('{"scope":"job_related","answer":"Café 😀"}') + completed(),
    );

    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const byte of bytes) {
            controller.enqueue(Uint8Array.of(byte));
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );

    const onDelta = vi.fn();
    await readSmartMatchStream(response, onDelta, vi.fn());

    expect(onDelta.mock.calls.map(([text]) => text).join("")).toBe("Café 😀");
  });

  it("does not expose an out-of-scope answer", async () => {
    const onDelta = vi.fn();

    await readSmartMatchStream(
      responseFrom([
        delta('{"scope":"out_of_scope","answer":"Do not expose"}'),
        completed(),
      ]),
      onDelta,
      vi.fn(),
    );

    expect(onDelta).not.toHaveBeenCalled();
  });

  it.each(["response.completed", "response.incomplete", "response.failed"])(
    "reports terminal usage for %s",
    async (type) => {
      const onTerminal = vi.fn();
      const value = { ...terminal, status: type.split(".")[1] };

      await expect(
        readSmartMatchStream(
          responseFrom([event({ type, response: value })]),
          vi.fn(),
          onTerminal,
        ),
      ).resolves.toEqual(value);

      expect(onTerminal).toHaveBeenCalledExactlyOnceWith(value);
    },
  );

  it("rejects partial output without a terminal response", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom([delta('{"scope":"job_related","answer":"Partial')]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("does not mistake DONE alone for successful completion", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom(["data: [DONE]\n\n"]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects an explicit provider error", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom([
          event({ type: "error", message: "private provider detail" }),
        ]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "AI couldn’t complete this request. Please try again later.",
    });
  });

  it("rejects malformed event JSON", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom(["data: {invalid}\n\n"]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toThrow();
  });

  it("rejects a second output-text part", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom([
          delta('{"scope":"job_related","answer":"First', "msg_a"),
          delta(' second"}', "msg_b"),
          completed(),
        ]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects invalid JSON escapes", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom([
          delta('{"scope":"job_related","answer":"Bad\\q'),
          completed(),
        ]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects answers exceeding the answer-length limit", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom([
          delta('{"scope":"job_related","answer":"' + "a".repeat(12_001)),
          completed(),
        ]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects streams exceeding the byte limit", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom(["x".repeat(2_000_001)]),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects a non-SSE response", async () => {
    await expect(
      readSmartMatchStream(
        responseFrom(["{}"], "application/json"),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("rejects a missing response body", async () => {
    await expect(
      readSmartMatchStream(
        new Response(null, {
          headers: { "Content-Type": "text/event-stream" },
        }),
        vi.fn(),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("cancels and releases the reader after a terminal event", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(completed()));
      },
      cancel,
    });

    await readSmartMatchStream(
      new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      }),
      vi.fn(),
      vi.fn(),
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });
});
