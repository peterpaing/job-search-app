import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobsError from "../../app/component/JobsError";

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: navigationMocks.refresh,
    push: navigationMocks.push,
    replace: navigationMocks.replace,
  }),
}));

describe("JobsError", () => {
  beforeEach(() => {
    navigationMocks.refresh.mockReset();
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
  });

  it("renders a friendly error message", () => {
    render(<JobsError />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t load jobs",
    );

    expect(
      screen.getByRole("heading", {
        name: "We couldn’t load jobs",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Please try again in a moment. Your search and filters are still saved.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an enabled retry button initially", () => {
    render(<JobsError />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();

    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes the current page when Try again is clicked", async () => {
    const user = userEvent.setup();

    render(<JobsError />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(navigationMocks.refresh).toHaveBeenCalledWith();
  });

  it("does not navigate away or replace the search URL when retrying", async () => {
    const user = userEvent.setup();

    render(<JobsError />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("does not display an empty-results message for a failed request", () => {
    render(<JobsError />);

    expect(screen.queryByText("No jobs found.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
