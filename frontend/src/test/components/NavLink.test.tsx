import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import NavLink from "../../app/component/NavLink";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("NavLink", () => {
  it("renders its label and destination", () => {
    vi.mocked(usePathname).mockReturnValue("/");

    render(<NavLink href="/saved-jobs">Saved</NavLink>);

    expect(screen.getByRole("link", { name: "Saved" })).toHaveAttribute(
      "href",
      "/saved-jobs",
    );
  });

  it.each([
    ["/", "/jobs"],
    ["/jobs", "/jobs"],
    ["/jobs/123", "/jobs"],
    ["/saved-jobs", "/saved-jobs"],
    ["/tracker", "/tracker"],
    ["/smart-match", "/smart-match"],
    ["/profile", "/profile"],
  ])("marks %s as active for the %s link", (pathname, href) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(<NavLink href={href}>Navigation link</NavLink>);

    expect(screen.getByRole("link")).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/", "/saved-jobs"],
    ["/tracker", "/jobs"],
    ["/jobs-other", "/jobs"],
    ["/jobs", "/"],
  ])("does not mark %s as active for the %s link", (pathname, href) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(<NavLink href={href}>Navigation link</NavLink>);

    expect(screen.getByRole("link")).not.toHaveAttribute("aria-current");
  });
});
