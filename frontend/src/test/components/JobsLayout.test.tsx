import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import JobsLayout from "../../app/component/JobsLayout";

vi.mock("../../app/component/JobFilters", () => ({
  default: () => <div>Filter options</div>,
}));

describe("JobsLayout", () => {
  it("renders the heading and children", () => {
    render(
      <JobsLayout>
        <p>Job results</p>
      </JobsLayout>,
    );

    expect(
      screen.getByRole("heading", { name: "Explore Developer Jobs" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Job results")).toBeInTheDocument();
  });

  it("starts with the filter toggle collapsed", () => {
    render(<JobsLayout>Job results</JobsLayout>);

    const button = screen.getByRole("button", { name: "Show filters" });
    const sidebar = screen.getByRole("complementary", {
      name: "Job filters",
    });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", sidebar.id);
    expect(sidebar).toHaveClass("hidden");
    expect(sidebar).toHaveClass("lg:block");
    expect(screen.getByText("Filter options")).toBeInTheDocument();
  });

  it("opens the filters when the toggle is clicked", async () => {
    const user = userEvent.setup();

    render(<JobsLayout>Job results</JobsLayout>);

    await user.click(screen.getByRole("button", { name: "Show filters" }));

    const button = screen.getByRole("button", { name: "Hide filters" });
    const sidebar = screen.getByRole("complementary", {
      name: "Job filters",
    });

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveTextContent("Filters");
    expect(sidebar).toHaveClass("block");
    expect(sidebar).not.toHaveClass("hidden");
    expect(screen.getByText("Job results")).toBeInTheDocument();
  });

  it("closes the filters when the toggle is clicked again", async () => {
    const user = userEvent.setup();

    render(<JobsLayout>Job results</JobsLayout>);

    await user.click(screen.getByRole("button", { name: "Show filters" }));
    await user.click(screen.getByRole("button", { name: "Hide filters" }));

    expect(
      screen.getByRole("button", { name: "Show filters" }),
    ).toHaveAttribute("aria-expanded", "false");

    expect(
      screen.getByRole("complementary", { name: "Job filters" }),
    ).toHaveClass("hidden");

    expect(screen.getByText("Job results")).toBeInTheDocument();
  });

  it("keeps the desktop visibility classes on the sidebar and toggle", () => {
    render(<JobsLayout>Job results</JobsLayout>);

    expect(
      screen.getByRole("complementary", { name: "Job filters" }),
    ).toHaveClass("lg:block");

    expect(screen.getByRole("button", { name: "Show filters" })).toHaveClass(
      "lg:hidden",
    );
  });
});
