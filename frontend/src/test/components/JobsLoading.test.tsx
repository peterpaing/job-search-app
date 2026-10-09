import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import JobsLoading from "../../app/component/JobsLoading";

describe("JobsLoading", () => {
  it("announces loading without a visible text label", () => {
    render(<JobsLoading />);

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent("Loading jobs…");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("sr-only");
  });

  it("does not show an empty-results message while loading", () => {
    render(<JobsLoading />);

    expect(screen.queryByText("No jobs found.")).not.toBeInTheDocument();
  });

  it("does not display job links or pagination while loading", () => {
    render(<JobsLoading />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Job pagination" }),
    ).not.toBeInTheDocument();
  });
});
