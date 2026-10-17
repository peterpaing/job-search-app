import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmartMatchUsage, {
  type SmartMatchUsageData,
} from "../../app/component/SmartMatchUsage";
import SmartMatchPage from "../../app/smart-match/page";

const streamMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  clerk: {
    user: { id: "user_stream_page" },
    session: {
      id: "session_stream_page",
      getToken: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: streamMocks.clerk.user.id,
    sessionId: streamMocks.clerk.session.id,
  }),
  useClerk: () => streamMocks.clerk,
}));

// Keep the real chat component and request parser.
// Only replace the job card so this test does not need saved-job providers.
vi.mock("../../app/component/JobCard", () => ({
  default: ({
    job,
    onAsk,
    askDisabled,
  }: {
    job: { title: string };
    onAsk: (trigger: HTMLButtonElement) => void;
    askDisabled?: boolean;
  }) => (
    <article>
      <h3>{job.title}</h3>
      <button
        type="button"
        disabled={askDisabled}
        onClick={(event) => onAsk(event.currentTarget)}
      >
        Open streamed job chat
      </button>
    </article>
  ),
}));

const usage: SmartMatchUsageData = {
  used: 3,
  limit: 20,
  remaining: 17,
  resetsAt: "2026-10-14T00:00:00.000Z",

  monthly: {
    used: 30,
    limit: 100,
    remaining: 70,
    resetsAt: "2026-11-01T00:00:00.000Z",
  },

  tokens: {
    daily: {
      committed: 5000,
      limit: 50000,
    },
    monthly: {
      committed: 100000,
      limit: 500000,
    },
    input: 80000,
    cachedInput: 10000,
    output: 10000,
  },
};

async function openDetails() {
  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Usage details",
    }),
  );
}

describe("SmartMatchUsage scrolling", () => {
  it("closes when the page scrolls", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    fireEvent.scroll(window);

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when the card's own content scrolls", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    const card = screen.getByRole("complementary", {
      name: "AI usage allowance",
    });

    const previousMaxHeight = card.style.maxHeight;

    fireEvent.scroll(card);

    expect(
      screen.getByRole("region", {
        name: "AI usage details",
      }),
    ).toBeInTheDocument();

    expect(card.style.maxHeight).toBe(previousMaxHeight);
  });

  it("closes when a scrollable ancestor moves", async () => {
    render(
      <div data-testid="scroll-container">
        <SmartMatchUsage usage={usage} />
      </div>,
    );

    await openDetails();

    fireEvent.scroll(screen.getByTestId("scroll-container"));

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();
  });

  it("closes when the viewport resizes", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    fireEvent.resize(window);

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses a stacking level below the navbar", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    const card = screen.getByRole("complementary", {
      name: "AI usage allowance",
    });

    expect(card.parentElement).toHaveClass("z-40");
  });

  describe("SmartMatch page answer-stream integration", () => {
    const streamJob = {
      id: "stream-job",
      source: "Test",
      title: "Streaming Frontend Role",
      company: "Example",
      companyLogo: null,
      description: "Build React applications.",
      location: "Remote",
      tags: ["React"],
      url: "https://example.com/stream-job",
      postedAt: "2026-10-13T00:00:00.000Z",
    };

    let controller: ReadableStreamDefaultController<Uint8Array>;
    let streamResponse: Response;
    let streamClosed: boolean;

    function jsonResponse(value: unknown) {
      return new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" },
      });
    }

    function pushRaw(value: string) {
      controller.enqueue(new TextEncoder().encode(value));
    }

    function pushFrame(value: unknown) {
      pushRaw(`${JSON.stringify(value)}\n`);
    }

    function closeStream() {
      if (streamClosed) return;

      streamClosed = true;

      try {
        controller.close();
      } catch {
        // A successfully consumed or canceled stream may already be closed.
      }
    }

    function askCalls() {
      return streamMocks.fetch.mock.calls.filter(([input]) =>
        new URL(String(input)).pathname.endsWith("/ask"),
      );
    }

    async function openChatAndAsk() {
      const user = userEvent.setup();
      const view = render(<SmartMatchPage />);

      await user.click(
        await screen.findByRole("button", {
          name: "Open streamed job chat",
        }),
      );

      await user.type(
        screen.getByRole("textbox", { name: "Your question" }),
        "Explain my fit.",
      );
      await user.click(screen.getByRole("button", { name: "Send question" }));

      await waitFor(() => {
        expect(askCalls()).toHaveLength(1);
      });

      return view;
    }

    beforeEach(() => {
      streamMocks.fetch.mockReset();
      streamMocks.clerk.user.id = "user_stream_page";
      streamMocks.clerk.session.id = "session_stream_page";
      streamMocks.clerk.session.getToken
        .mockReset()
        .mockResolvedValue("stream-test-token");

      vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5000");
      vi.stubGlobal("fetch", streamMocks.fetch);

      streamClosed = false;

      streamResponse = new Response(
        new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
          cancel() {
            streamClosed = true;
          },
        }),
        {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
          },
        },
      );

      streamMocks.fetch.mockImplementation(async (input: unknown) => {
        const path = new URL(String(input)).pathname;

        if (path.endsWith("/bootstrap")) {
          return jsonResponse({
            access: {
              premium: true,
              aiEnabled: true,
              dailyLimit: 20,
            },
            profile: {
              skills: ["React"],
              roles: ["Frontend Engineer"],
              experience: "mid",
              location: "",
              workMode: "remote",
            },
            usage,
            matches: [
              {
                job: streamJob,
                matchedSkills: ["React"],
                strength: "strong",
                workMode: "remote",
              },
            ],
            searched: 1,
          });
        }

        if (path.endsWith("/access")) {
          return jsonResponse({
            premium: true,
            aiEnabled: true,
            dailyLimit: 20,
          });
        }

        if (path.endsWith("/ask")) {
          return streamResponse;
        }

        throw new Error(`Unexpected test request: ${path}`);
      });
    });

    afterEach(async () => {
      cleanup();
      closeStream();
      await Promise.resolve();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it("requests NDJSON and displays a delta before completion", async () => {
      await openChatAndAsk();

      const [, options] = askCalls()[0];

      expect(options.headers).toMatchObject({
        Authorization: "Bearer stream-test-token",
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(options.body)).toEqual({
        jobId: "stream-job",
        question: "Explain my fit.",
      });

      await act(async () => {
        pushFrame({ type: "delta", delta: "Early React advice" });
      });

      expect(screen.getByText("Early React advice")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Send question" }),
      ).toBeDisabled();

      await act(async () => {
        pushFrame({
          type: "done",
          result: {
            answer: "Validated React advice.",
            cached: false,
            usage,
          },
        });
        closeStream();
      });

      expect(screen.getByText("Validated React advice.")).toBeInTheDocument();
      expect(screen.queryByText("Early React advice")).not.toBeInTheDocument();
      expect(askCalls()).toHaveLength(1);
    });

    it("parses frames split across network chunks", async () => {
      await openChatAndAsk();

      await act(async () => {
        pushRaw('{"type":"del');
      });

      expect(screen.getByText("Thinking…")).toBeInTheDocument();

      await act(async () => {
        pushRaw('ta","delta":"Split frame answer"}\n');
      });

      expect(screen.getByText("Split frame answer")).toBeInTheDocument();

      await act(async () => {
        pushFrame({
          type: "done",
          result: {
            answer: "Split frame answer",
            cached: false,
            usage,
          },
        });
        closeStream();
      });

      expect(askCalls()).toHaveLength(1);
    });

    it("does not treat a disconnected partial answer as complete", async () => {
      await openChatAndAsk();

      await act(async () => {
        pushFrame({ type: "delta", delta: "Unfinished answer" });
      });

      expect(screen.getByText("Unfinished answer")).toBeInTheDocument();

      await act(async () => {
        closeStream();
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "AI couldn’t complete this request.",
      );
      expect(screen.queryByText("Unfinished answer")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Your question" }),
      ).toHaveValue("Explain my fit.");
      expect(askCalls()).toHaveLength(1);
    });

    it("handles an error frame without retrying the AI request", async () => {
      await openChatAndAsk();

      await act(async () => {
        pushFrame({ type: "delta", delta: "Temporary partial text" });
        pushFrame({
          type: "error",
          status: 429,
          message: "Daily AI limit reached.",
        });
        closeStream();
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Daily AI limit reached.",
      );
      expect(
        screen.queryByText("Temporary partial text"),
      ).not.toBeInTheDocument();
      expect(askCalls()).toHaveLength(1);
    });

    it("supports a completed JSON response for cached answers", async () => {
      streamResponse = jsonResponse({
        answer: "Cached React advice.",
        cached: true,
        usage,
      });

      await openChatAndAsk();

      expect(
        await screen.findByText("Cached React advice."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
      expect(askCalls()).toHaveLength(1);
    });

    it("does not display stream text after the account changes", async () => {
      await openChatAndAsk();

      streamMocks.clerk.user.id = "user_replacement";
      streamMocks.clerk.session.id = "session_replacement";

      await act(async () => {
        pushFrame({
          type: "delta",
          delta: "Must not reach the replacement account",
        });
        closeStream();
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your account changed.",
      );
      expect(
        screen.queryByText("Must not reach the replacement account"),
      ).not.toBeInTheDocument();
      expect(askCalls()).toHaveLength(1);
    });
  });
});
