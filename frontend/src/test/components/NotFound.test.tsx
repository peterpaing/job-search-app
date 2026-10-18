import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "../../app/not-found";

describe("NotFound", () => {
  it("shows the custom message and links to the job browser", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Page not found",
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Browse jobs" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("requests exclusion from search results", () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: true,
    });
  });
});
