import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  remove: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  usage: vi.fn(),
  user: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    select: mocks.select,
    execute: mocks.execute,
    delete: mocks.remove,
  },
}));

vi.mock("../../services/users.service.js", () => ({
  getOrCreateUser: mocks.user,
}));

vi.mock("../../services/smart-match.budget.js", () => ({
  reserveBudget: mocks.reserve,
  settleBudget: mocks.settle,
  usageFor: mocks.usage,
}));

import {
  answerSmartMatchQuestion,
  extractSmartMatchProfile,
  storeSmartMatchProfile,
} from "../../services/smart-match.service.js";
import { SmartMatchError } from "../../services/smart-match.logic.js";
import { OUT_OF_SCOPE_MESSAGE } from "../../services/smart-match.scope.js";

const userId = "00000000-0000-4000-8000-000000000001";

const profile = {
  skills: ["React"],
  roles: ["Frontend Engineer"],
  experience: "junior" as const,
  location: "",
  workMode: "any" as const,
};

const usage = {
  used: 1,
  limit: 20,
  remaining: 19,
  resetsAt: "2026-10-14T00:00:00.000Z",
  monthly: {
    used: 1,
    limit: 100,
    remaining: 99,
    resetsAt: "2026-11-01T00:00:00.000Z",
  },
};

const tokens = {
  input_tokens: 3000,
  output_tokens: 600,
  input_tokens_details: {
    cached_tokens: 2000,
  },
};

const resumeText =
  "Frontend developer experienced in React and building web applications.";

const job = {
  id: "test-job",
  title: "Frontend Engineer",
  company: "Example",
  location: "Remote",
  tags: ["React"],
  description: "Build React applications.",
  updatedAt: "2026-10-13T00:00:00.000Z",
};

type SelectStub = {
  from: () => SelectStub;
  where: () => SelectStub;
  limit: () => Promise<unknown[]>;
};

function selectRows(rows: unknown[]): SelectStub {
  const builder: SelectStub = {
    from: () => builder,
    where: () => builder,
    limit: async () => rows,
  };

  return builder;
}

function providerResponse(
  value: unknown = profile,
  status = "completed",
  reportedUsage: unknown = tokens,
) {
  return {
    ok: true,
    json: async () => ({
      status,
      usage: reportedUsage,
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(value),
            },
          ],
        },
      ],
    }),
  };
}

function prepareQuestion() {
  mocks.select
    .mockReturnValueOnce(
      selectRows([
        {
          profile,
          updatedAt: "2026-10-13T00:00:00.000Z",
        },
      ]),
    )
    .mockReturnValueOnce(selectRows([job]))
    .mockReturnValueOnce(selectRows([]));
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.stubEnv("SMARTMATCH_AI_ENABLED", "true");
  vi.stubEnv("OPENAI_API_KEY", "fake-unit-test-key");
  vi.stubEnv("SMARTMATCH_USER_DAILY_LIMIT", "20");
  vi.stubEnv("SMARTMATCH_DAILY_BUDGET_CENTS", "500");
  vi.stubEnv("SMARTMATCH_MAX_INPUT_TOKENS", "24000");

  vi.stubGlobal("fetch", mocks.fetch);

  mocks.user.mockResolvedValue({
    id: userId,
  });

  mocks.select.mockReturnValue(selectRows([]));

  mocks.execute.mockResolvedValue({
    rows: [],
  });

  mocks.remove.mockReturnValue({
    where: async () => undefined,
  });

  mocks.reserve.mockResolvedValue(undefined);
  mocks.settle.mockResolvedValue(undefined);
  mocks.usage.mockResolvedValue(usage);

  mocks.fetch.mockResolvedValue(providerResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SmartMatch cached generations", () => {
  it("returns a valid cache hit without reserving allowance or calling AI", async () => {
    mocks.select.mockReturnValue(
      selectRows([
        {
          payload: profile,
        },
      ]),
    );

    expect(await extractSmartMatchProfile("clerk-user", resumeText)).toEqual({
      draft: profile,
      cached: true,
      usage,
    });

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("does not trust an invalid cached payload", async () => {
    mocks.select.mockReturnValue(
      selectRows([
        {
          payload: {
            skills: [123],
          },
        },
      ]),
    );

    expect(
      await extractSmartMatchProfile("clerk-user", resumeText),
    ).toMatchObject({
      cached: false,
      draft: profile,
    });

    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});

describe("SmartMatch allowance enforcement", () => {
  it.each([
    "Monthly AI limit reached.",
    "Daily AI limit reached.",
    "Monthly token allowance reached.",
    "Daily token allowance reached.",
    "Monthly spending allowance reached.",
  ])("never contacts AI when reservation is rejected: %s", async (message) => {
    mocks.reserve.mockRejectedValue(new SmartMatchError(429, message));

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 429,
      message,
    });

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects excessive input before reserving or contacting AI", async () => {
    await expect(
      extractSmartMatchProfile("clerk-user", "x".repeat(80_001)),
    ).rejects.toMatchObject({
      status: 413,
    });

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects the conservative input bound before spending allowance", async () => {
    vi.stubEnv("SMARTMATCH_MAX_INPUT_TOKENS", "10");

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 413,
    });

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not contact AI when disabled", async () => {
    vi.stubEnv("SMARTMATCH_AI_ENABLED", "false");

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 503,
    });

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("SmartMatch generation accounting", () => {
  it("reserves first, records tokens, and then stores the result", async () => {
    expect(await extractSmartMatchProfile("clerk-user", resumeText)).toEqual({
      draft: profile,
      cached: false,
      usage,
    });

    expect(mocks.reserve).toHaveBeenCalledWith(
      userId,
      expect.any(String),
      "extract",
      expect.objectContaining({
        inputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
        micro: expect.any(Number),
      }),
    );

    const leaseId = mocks.reserve.mock.calls[0]![1];

    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(leaseId, tokens);

    expect(mocks.reserve.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0]!,
    );

    expect(mocks.fetch.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.settle.mock.invocationCallOrder[0]!,
    );

    expect(mocks.settle.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.execute.mock.invocationCallOrder[0]!,
    );

    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("records usage for incomplete responses", async () => {
    mocks.fetch.mockResolvedValue(providerResponse(profile, "incomplete"));

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 502,
    });

    expect(mocks.settle).toHaveBeenCalledWith(expect.any(String), tokens);

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("records usage even when the generated JSON is invalid", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        usage: tokens,
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "not valid JSON",
              },
            ],
          },
        ],
      }),
    });

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 502,
    });

    expect(mocks.settle).toHaveBeenCalledWith(expect.any(String), tokens);

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("records usage even when the profile fails validation", async () => {
    mocks.fetch.mockResolvedValue(
      providerResponse({
        ...profile,
        skills: [123],
      }),
    );

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 502,
    });

    expect(mocks.settle).toHaveBeenCalledWith(expect.any(String), tokens);
  });

  it("records usage when no answer text is returned", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        usage: tokens,
        output: [],
      }),
    });

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 422,
    });

    expect(mocks.settle).toHaveBeenCalledWith(expect.any(String), tokens);
  });

  it("keeps unknown usage after network failure without retrying AI", async () => {
    mocks.fetch.mockRejectedValue(new Error("Synthetic network timeout"));

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 502,
    });

    expect(mocks.fetch).toHaveBeenCalledOnce();

    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      null,
    );

    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("treats missing provider usage as unknown instead of zero", async () => {
    mocks.fetch.mockResolvedValue(providerResponse(profile, "completed", null));

    await extractSmartMatchProfile("clerk-user", resumeText);

    expect(mocks.settle).toHaveBeenCalledWith(expect.any(String), null);
  });

  it("retains unknown usage for provider HTTP errors", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          message: "Synthetic provider failure",
        },
      }),
    });

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 502,
    });

    expect(mocks.settle).toHaveBeenCalledWith(expect.any(String), null);

    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("does not retry AI if database settlement fails", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.settle.mockRejectedValue(new Error("Synthetic accounting failure"));

    await expect(
      extractSmartMatchProfile("clerk-user", resumeText),
    ).rejects.toMatchObject({
      status: 502,
    });

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.settle).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledOnce();

    expect(errorLog).toHaveBeenCalledWith(
      "[smartmatch-accounting] Settlement needs reconciliation.",
    );
  });
});

describe("SmartMatch job questions", () => {
  it("rejects obvious generic coding questions without an AI call", async () => {
    prepareQuestion();

    expect(
      await answerSmartMatchQuestion(
        "clerk-user",
        job.id,
        "What is the <p> tag and <div>?",
      ),
    ).toMatchObject({
      answer: OUT_OF_SCOPE_MESSAGE,
      outOfScope: true,
    });

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("accounts for model-classified out-of-scope answers", async () => {
    prepareQuestion();

    mocks.fetch.mockResolvedValue(
      providerResponse({
        scope: "out_of_scope",
        answer: "",
      }),
    );

    expect(
      await answerSmartMatchQuestion("clerk-user", job.id, "Tell me a joke."),
    ).toMatchObject({
      answer: OUT_OF_SCOPE_MESSAGE,
      outOfScope: true,
      cached: false,
    });

    expect(mocks.reserve).toHaveBeenCalledOnce();

    expect(mocks.settle).toHaveBeenCalledWith(expect.any(String), tokens);
  });
});

describe("SmartMatch profile deletion", () => {
  it("returns retained usage after deleting a profile", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          stored: true,
        },
      ],
    });

    expect(await storeSmartMatchProfile("clerk-user", null)).toEqual({
      profile: null,
      usage,
    });

    expect(mocks.user).toHaveBeenCalledWith("clerk-user");
    expect(mocks.usage).toHaveBeenCalledWith(userId);

    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  describe("SmartMatch streamed question accounting", () => {
    const question = "Explain my fit for this job.";
    const answer = {
      scope: "job_related",
      answer: "Highlight your React experience.",
    };

    function prepareStreamQuestion(cached?: unknown) {
      mocks.select
        .mockReturnValueOnce(
          selectRows([
            {
              profile,
              updatedAt: "2026-10-13T00:00:00.000Z",
            },
          ]),
        )
        .mockReturnValueOnce(selectRows([job]))
        .mockReturnValueOnce(
          selectRows(cached === undefined ? [] : [{ payload: cached }]),
        );
    }

    function terminalResponse(
      value: unknown,
      status = "completed",
      reportedUsage: unknown = tokens,
    ) {
      return {
        status,
        usage: reportedUsage,
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(value),
              },
            ],
          },
        ],
      };
    }

    function providerStream(
      parts: string[],
      terminal: ReturnType<typeof terminalResponse> | null,
    ) {
      const encoder = new TextEncoder();

      function frame(value: unknown) {
        return encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
      }

      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(
                frame({
                  type: "response.output_text.delta",
                  delta: part,
                  item_id: "msg_service_test",
                  output_index: 0,
                  content_index: 0,
                }),
              );
            }

            if (terminal) {
              controller.enqueue(
                frame({
                  type: `response.${terminal.status}`,
                  response: terminal,
                }),
              );
            }

            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
          },
        },
      );
    }

    it("streams answer text while retaining reservation and settlement ordering", async () => {
      prepareStreamQuestion();

      mocks.fetch.mockResolvedValue(
        providerStream(
          [
            '{"scope":"job_related","answer":"Highlight ',
            'your React experience."}',
          ],
          terminalResponse(answer),
        ),
      );

      const onDelta = vi.fn();

      await expect(
        answerSmartMatchQuestion("clerk-user", job.id, question, onDelta),
      ).resolves.toMatchObject({
        answer: answer.answer,
        cached: false,
        usage,
      });

      expect(onDelta.mock.calls.map(([text]) => text).join("")).toBe(
        answer.answer,
      );

      expect(mocks.reserve).toHaveBeenCalledWith(
        userId,
        expect.any(String),
        "answer",
        expect.any(Object),
      );

      expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
        mocks.reserve.mock.calls[0]![1],
        tokens,
      );

      const body = JSON.parse(mocks.fetch.mock.calls[0]![1].body) as Record<
        string,
        unknown
      >;

      expect(body.stream).toBe(true);
      expect(body.store).toBe(false);

      expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.fetch.mock.invocationCallOrder[0],
      );
      expect(mocks.settle.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.execute.mock.invocationCallOrder[0],
      );
      expect(mocks.execute).toHaveBeenCalledTimes(1);
      expect(mocks.remove).toHaveBeenCalledTimes(1);
    });

    it("uses a valid cached answer without a new AI request or reservation", async () => {
      prepareStreamQuestion(answer);

      const onDelta = vi.fn();

      await expect(
        answerSmartMatchQuestion("clerk-user", job.id, question, onDelta),
      ).resolves.toMatchObject({
        answer: answer.answer,
        cached: true,
        usage,
      });

      expect(onDelta).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.settle).not.toHaveBeenCalled();
    });

    it("does not contact AI when a streaming reservation is rejected", async () => {
      prepareStreamQuestion();

      mocks.reserve.mockRejectedValue(
        new SmartMatchError(429, "Daily AI limit reached."),
      );

      await expect(
        answerSmartMatchQuestion("clerk-user", job.id, question, vi.fn()),
      ).rejects.toMatchObject({
        status: 429,
        message: "Daily AI limit reached.",
      });

      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.settle).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    });

    it.each(["incomplete", "failed"])(
      "settles reported usage but never caches a %s stream",
      async (status) => {
        prepareStreamQuestion();

        mocks.fetch.mockResolvedValue(
          providerStream(
            ['{"scope":"job_related","answer":"Partial'],
            terminalResponse(answer, status),
          ),
        );

        await expect(
          answerSmartMatchQuestion("clerk-user", job.id, question, vi.fn()),
        ).rejects.toMatchObject({ status: 502 });

        expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
          expect.any(String),
          tokens,
        );
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(mocks.remove).toHaveBeenCalledTimes(1);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
      },
    );

    it("keeps usage unknown after an interrupted stream and does not retry AI", async () => {
      prepareStreamQuestion();

      mocks.fetch.mockResolvedValue(
        providerStream(['{"scope":"job_related","answer":"Unfinished'], null),
      );

      await expect(
        answerSmartMatchQuestion("clerk-user", job.id, question, vi.fn()),
      ).rejects.toMatchObject({ status: 502 });

      expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        null,
      );
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.remove).toHaveBeenCalledTimes(1);
    });

    it("settles usage before rejecting an invalid completed answer", async () => {
      prepareStreamQuestion();

      mocks.fetch.mockResolvedValue(
        providerStream(
          ['{"scope":"job_related","answer":"Provisional"}'],
          terminalResponse({
            scope: "job_related",
            answer: 123,
          }),
        ),
      );

      await expect(
        answerSmartMatchQuestion("clerk-user", job.id, question, vi.fn()),
      ).rejects.toMatchObject({ status: 502 });

      expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        tokens,
      );
      expect(mocks.execute).not.toHaveBeenCalled();
    });

    it("does not emit model-classified out-of-scope answer text", async () => {
      prepareStreamQuestion();

      const classified = {
        scope: "out_of_scope",
        answer: "",
      };
      const onDelta = vi.fn();

      mocks.fetch.mockResolvedValue(
        providerStream(
          [JSON.stringify(classified)],
          terminalResponse(classified),
        ),
      );

      await expect(
        answerSmartMatchQuestion(
          "clerk-user",
          job.id,
          "Tell me a joke.",
          onDelta,
        ),
      ).resolves.toMatchObject({
        answer: OUT_OF_SCOPE_MESSAGE,
        outOfScope: true,
        cached: false,
      });

      expect(onDelta).not.toHaveBeenCalled();
      expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        tokens,
      );
    });

    it("does not emit or spend allowance for obvious generic coding questions", async () => {
      prepareStreamQuestion();

      const onDelta = vi.fn();

      await answerSmartMatchQuestion(
        "clerk-user",
        job.id,
        "What is the <p> tag and <div>?",
        onDelta,
      );

      expect(onDelta).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("does not interpret missing terminal usage as zero", async () => {
      prepareStreamQuestion();

      mocks.fetch.mockResolvedValue(
        providerStream(
          [JSON.stringify(answer)],
          terminalResponse(answer, "completed", null),
        ),
      );

      await answerSmartMatchQuestion("clerk-user", job.id, question, vi.fn());

      expect(mocks.settle).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        null,
      );
    });
  });
});
