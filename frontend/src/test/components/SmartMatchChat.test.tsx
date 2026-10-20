import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SmartMatchChat from "../../app/component/SmartMatchChat";
import type { Job } from "../../app/component/JobCard";

const job: Job = {
  id: "job-a",
  source: "Test",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "",
  location: "Remote",
  tags: ["React"],
  url: "https://example.com/job-a",
  postedAt: "2026-10-12T00:00:00.000Z",
};

type Answer = {
  answer: string;
  cached: boolean;
  outOfScope?: boolean;
};

describe("SmartMatchChat", () => {
  it("opens without automatically calling AI", () => {
    const ask = vi.fn();

    render(
      <SmartMatchChat
        job={job}
        aiEnabled
        disabled={false}
        onAsk={ask}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    expect(
      screen.getByRole("textbox", { name: "Your question" }),
    ).toHaveFocus();

    expect(ask).not.toHaveBeenCalled();
  });

  it("shows Thinking while an answer is pending", async () => {
    const user = userEvent.setup();

    let resolveAnswer: ((value: Answer) => void) | undefined;

    const ask = vi.fn(
      () =>
        new Promise<Answer>((resolve) => {
          resolveAnswer = resolve;
        }),
    );

    render(
      <SmartMatchChat
        job={job}
        aiEnabled
        disabled={false}
        onAsk={ask}
        onClose={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Your question" }),
      "Explain my fit.",
    );

    await user.click(screen.getByRole("button", { name: "Send question" }));

    expect(
      screen.getByRole("status", { name: "Answer status" }),
    ).toHaveTextContent("Generating answer.");

    expect(screen.getByText("Thinking…")).toHaveClass("smartmatch-thinking");

    await act(async () => {
      resolveAnswer?.({
        answer: "Highlight your React experience.",
        cached: false,
      });
    });

    expect(
      await screen.findByText("Highlight your React experience."),
    ).toBeInTheDocument();

    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("displays the scope notice for an unrelated question", async () => {
    const user = userEvent.setup();

    const ask = vi.fn().mockResolvedValue({
      answer: "Please ask about the selected job.",
      cached: false,
      outOfScope: true,
    });

    render(
      <SmartMatchChat
        job={job}
        aiEnabled
        disabled={false}
        onAsk={ask}
        onClose={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Your question" }),
      "Explain HTML.",
    );

    await user.click(screen.getByRole("button", { name: "Send question" }));

    expect(
      await screen.findByText("Please ask about the selected job."),
    ).toBeInTheDocument();

    expect(
      screen.getByText("This assistant is limited to the selected job."),
    ).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const close = vi.fn();

    render(
      <SmartMatchChat
        job={job}
        aiEnabled
        disabled={false}
        onAsk={vi.fn()}
        onClose={close}
      />,
    );

    await user.keyboard("{Escape}");

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("disables sending when AI is unavailable", () => {
    render(
      <SmartMatchChat
        job={job}
        aiEnabled={false}
        disabled={false}
        onAsk={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Send question" }),
    ).toBeDisabled();

    expect(
      screen.getByText(
        "AI is temporarily unavailable. Please try again later.",
      ),
    ).toBeInTheDocument();
  });
  describe("SmartMatchChat streamed answers", () => {
    function startChat() {
      let emit!: (delta: string) => void;
      let resolve!: (answer: Answer) => void;
      let reject!: (error: Error) => void;

      const ask = vi.fn(
        (_question: string, onDelta: (delta: string) => void) => {
          emit = onDelta;

          return new Promise<Answer>((resolveAnswer, rejectAnswer) => {
            resolve = resolveAnswer;
            reject = rejectAnswer;
          });
        },
      );

      const view = render(
        <SmartMatchChat
          job={job}
          aiEnabled
          disabled={false}
          onAsk={ask}
          onClose={vi.fn()}
        />,
      );

      return {
        ...view,
        ask,
        emit: (text: string) => emit(text),
        finish: (value: Answer) => resolve(value),
        fail: (error: Error) => reject(error),
      };
    }

    async function sendQuestion() {
      const user = userEvent.setup();

      await user.type(
        screen.getByRole("textbox", { name: "Your question" }),
        "Explain my fit.",
      );
      await user.click(screen.getByRole("button", { name: "Send question" }));
    }

    it("shows partial answer text before the answer finishes", async () => {
      const chat = startChat();
      await sendQuestion();

      expect(screen.getByText("Thinking…")).toBeInTheDocument();

      act(() => {
        chat.emit("Highlight ");
      });

      expect(screen.getByText("Highlight")).toBeInTheDocument();
      expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Send question" }),
      ).toBeDisabled();

      act(() => {
        chat.emit("your React experience.");
      });

      expect(
        screen.getByText("Highlight your React experience."),
      ).toBeInTheDocument();

      await act(async () => {
        chat.finish({
          answer: "Highlight your React experience.",
          cached: false,
        });
      });

      expect(chat.ask).toHaveBeenCalledTimes(1);
    });

    it("replaces provisional text with the validated final answer", async () => {
      const chat = startChat();
      await sendQuestion();

      act(() => {
        chat.emit("Provisional text");
      });

      await act(async () => {
        chat.finish({
          answer: "Validated final answer.",
          cached: false,
        });
      });

      expect(screen.getByText("Validated final answer.")).toBeInTheDocument();
      expect(screen.queryByText("Provisional text")).not.toBeInTheDocument();
    });

    it("removes an interrupted partial answer and restores the question", async () => {
      const chat = startChat();
      await sendQuestion();

      act(() => {
        chat.emit("Incomplete advice");
      });

      await act(async () => {
        chat.fail(new Error("Answer interrupted."));
      });

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Answer interrupted.",
      );
      expect(screen.queryByText("Incomplete advice")).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: "Your question" }),
      ).toHaveValue("Explain my fit.");
      expect(
        screen.getByRole("button", { name: "Send question" }),
      ).toBeEnabled();

      expect(chat.ask).toHaveBeenCalledTimes(1);
    });

    it("does not send a second request while the first answer is streaming", async () => {
      const chat = startChat();
      await sendQuestion();

      act(() => {
        chat.emit("Partial");
      });

      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Send question" }));

      expect(chat.ask).toHaveBeenCalledTimes(1);

      await act(async () => {
        chat.finish({ answer: "Complete.", cached: false });
      });
    });

    it("ignores late deltas after the chat is unmounted", async () => {
      const chat = startChat();
      await sendQuestion();

      chat.unmount();

      await act(async () => {
        chat.emit("Late answer");
        chat.finish({ answer: "Late answer", cached: false });
      });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      expect(chat.ask).toHaveBeenCalledTimes(1);
    });
    it("keeps the announcement unchanged while answer fragments stream", async () => {
      const chat = startChat();
      await sendQuestion();

      const status = screen.getByRole("status", {
        name: "Answer status",
      });

      expect(status).toHaveTextContent("Generating answer.");

      act(() => {
        chat.emit("Highlight ");
      });

      const answerRegion = screen.getByRole("region", {
        name: "AI answer",
      });

      expect(answerRegion).toHaveAttribute("aria-live", "off");
      expect(answerRegion).toHaveAttribute("aria-busy", "true");
      expect(status).toHaveTextContent("Generating answer.");
      expect(status).not.toHaveTextContent("Highlight");

      act(() => {
        chat.emit("your React experience.");
      });

      expect(status).toHaveTextContent("Generating answer.");
      expect(answerRegion).toHaveTextContent(
        "Highlight your React experience.",
      );

      await act(async () => {
        chat.finish({
          answer: "Highlight your React experience.",
          cached: false,
        });
      });

      expect(status).toHaveTextContent(
        "Answer ready. Read the AI answer section.",
      );
      expect(answerRegion).toHaveAttribute("aria-busy", "false");
    });

    it("does not announce completion when streaming fails", async () => {
      const chat = startChat();
      await sendQuestion();

      act(() => {
        chat.emit("Incomplete advice");
      });

      await act(async () => {
        chat.fail(new Error("Answer interrupted."));
      });

      expect(
        screen.getByRole("status", { name: "Answer status" }),
      ).toBeEmptyDOMElement();

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Answer interrupted.",
      );

      expect(
        screen.queryByRole("region", { name: "AI answer" }),
      ).not.toBeInTheDocument();
    });
  });
});
