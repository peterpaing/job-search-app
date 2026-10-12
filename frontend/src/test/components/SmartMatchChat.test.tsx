import { act, render, screen } from "@testing-library/react";
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
      screen.getByRole("status", { name: "Generating answer" }),
    ).toHaveAttribute("aria-busy", "true");

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
});
