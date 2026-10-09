import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import JobsResultsCount from "../../app/component/JobsResultsCount";

describe("JobsResultsCount", () => {
  it("shows zero matching jobs", () => {
    render(<JobsResultsCount total={0} />);

    expect(
      screen.getByRole("status", { name: "Job results count" }),
    ).toHaveTextContent("0 jobs found");
  });

  it("uses singular wording for one job", () => {
    render(<JobsResultsCount total={1} />);

    expect(
      screen.getByRole("status", { name: "Job results count" }),
    ).toHaveTextContent("1 job found");
  });

  it("uses plural wording for multiple jobs", () => {
    render(<JobsResultsCount total={42} />);

    expect(
      screen.getByRole("status", { name: "Job results count" }),
    ).toHaveTextContent("42 jobs found");
  });

  it("formats large counts with thousands separators", () => {
    render(<JobsResultsCount total={1234} />);

    expect(
      screen.getByRole("status", { name: "Job results count" }),
    ).toHaveTextContent("1,234 jobs found");
  });

  it("announces result changes accessibly", () => {
    render(<JobsResultsCount total={42} />);

    const status = screen.getByRole("status", {
      name: "Job results count",
    });

    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
  });

  it("updates when the total changes", () => {
    const { rerender } = render(<JobsResultsCount total={42} />);

    rerender(<JobsResultsCount total={12} />);

    expect(
      screen.getByRole("status", { name: "Job results count" }),
    ).toHaveTextContent("12 jobs found");

    rerender(<JobsResultsCount total={0} />);

    expect(
      screen.getByRole("status", { name: "Job results count" }),
    ).toHaveTextContent("0 jobs found");
  });
});
