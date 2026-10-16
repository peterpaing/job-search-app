import { z } from "zod";
import { SmartMatchError } from "./smart-match.logic.js";

const eventSchema = z
  .object({
    type: z.string(),
    delta: z.string().optional(),
    response: z.unknown().optional(),
    item_id: z.string().optional(),
    output_index: z.number().optional(),
    content_index: z.number().optional(),
  })
  .passthrough();

function streamError() {
  return new SmartMatchError(
    502,
    "AI couldn’t complete this request. Please try again later.",
  );
}

// Read only the answer string, after the structured scope classification.
// Never send the surrounding JSON or an out-of-scope model answer.
function partialJobAnswer(json: string): string {
  const prefix =
    /^\s*\{\s*"scope"\s*:\s*"job_related"\s*,\s*"answer"\s*:\s*"/.exec(json);

  if (!prefix) {
    return "";
  }

  const source = json.slice(prefix[0].length);
  let end = 0;

  while (end < source.length) {
    const character = source[end];

    if (character === '"') {
      break;
    }

    if (character === "\\") {
      const escaped = source[end + 1];

      if (escaped === undefined) {
        break;
      }

      if (escaped === "u") {
        const digits = source.slice(end + 2, end + 6);

        if (digits.length < 4) {
          break;
        }

        if (!/^[0-9a-fA-F]{4}$/.test(digits)) {
          throw streamError();
        }

        end += 6;
        continue;
      }

      if (!'"\\/bfnrt'.includes(escaped)) {
        throw streamError();
      }

      end += 2;
      continue;
    }

    if (source.charCodeAt(end) < 0x20) {
      throw streamError();
    }

    end += 1;
  }

  let answer = JSON.parse(`"${source.slice(0, end)}"`) as string;

  // A Unicode surrogate pair can cross provider chunks.
  const lastCode = answer.charCodeAt(answer.length - 1);

  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    answer = answer.slice(0, -1);
  }

  if (answer.length > 12_000) {
    throw streamError();
  }

  return answer;
}

export async function readSmartMatchStream(
  response: Response,
  onDelta: (delta: string) => void,
  onTerminalResponse: (response: unknown) => void,
): Promise<unknown> {
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  ) {
    throw streamError();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let dataLines: string[] = [];
  let receivedBytes = 0;
  let structuredText = "";
  let emittedAnswer = "";
  let textPart: string | null = null;
  let terminal: { response: unknown } | undefined;

  function dispatchEvent() {
    if (dataLines.length === 0) {
      return;
    }

    const data = dataLines.join("\n");
    dataLines = [];

    if (data === "[DONE]") {
      return;
    }

    const event = eventSchema.parse(JSON.parse(data) as unknown);

    if (
      event.type === "response.completed" ||
      event.type === "response.incomplete" ||
      event.type === "response.failed"
    ) {
      // Record any reported usage before later validation can fail.
      onTerminalResponse(event.response);
      terminal = { response: event.response };
      return;
    }

    if (event.type === "error") {
      throw streamError();
    }

    if (event.type !== "response.output_text.delta") {
      return;
    }

    if (typeof event.delta !== "string") {
      throw streamError();
    }

    const currentPart = JSON.stringify([
      event.item_id,
      event.output_index,
      event.content_index,
    ]);

    if (textPart !== null && textPart !== currentPart) {
      throw streamError();
    }

    textPart = currentPart;
    structuredText += event.delta;

    if (structuredText.length > 100_000) {
      throw streamError();
    }

    const answer = partialJobAnswer(structuredText);

    if (!answer.startsWith(emittedAnswer)) {
      throw streamError();
    }

    const delta = answer.slice(emittedAnswer.length);

    if (delta) {
      onDelta(delta);
      emittedAnswer = answer;
    }
  }

  function consumeLine(line: string) {
    if (line.endsWith("\r")) {
      line = line.slice(0, -1);
    }

    if (line === "") {
      dispatchEvent();
      return;
    }

    if (line.startsWith("data:")) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  }

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        buffer += decoder.decode();
      } else {
        receivedBytes += chunk.value.byteLength;

        if (receivedBytes > 2_000_000) {
          throw streamError();
        }

        buffer += decoder.decode(chunk.value, { stream: true });
      }

      let newline = buffer.indexOf("\n");

      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consumeLine(line);

        if (terminal) {
          return terminal.response;
        }

        newline = buffer.indexOf("\n");
      }

      if (chunk.done) {
        if (buffer) {
          consumeLine(buffer);
        }

        dispatchEvent();

        if (terminal) {
          return terminal.response;
        }

        // Partial text alone is never a successful result.
        throw streamError();
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
