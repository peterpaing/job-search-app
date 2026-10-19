import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Footer from "../../app/component/Footer";

vi.mock("next/image", () => ({
  // The footer tests navigation, not Next.js image optimization.
  default: () => <span aria-hidden="true">StackWing logo</span>,
}));

describe("Footer navigation", () => {
  it("removes Home and places SmartMatch after Application tracker", () => {
    render(<Footer />);

    const navigation = within(
      screen.getByRole("navigation", { name: "Footer navigation" }),
    );

    expect(
      navigation.getAllByRole("link").map((link) => ({
        name: link.textContent,
        href: link.getAttribute("href"),
      })),
    ).toEqual([
      { name: "Developer jobs", href: "/jobs" },
      { name: "Saved jobs", href: "/saved-jobs" },
      { name: "Application tracker", href: "/tracker" },
      { name: "SmartMatch", href: "/smart-match" },
    ]);

    expect(
      navigation.queryByRole("link", { name: "Home" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the logo linked to the home page", () => {
    render(<Footer />);

    expect(
      screen.getByRole("link", { name: "StackWing home" }),
    ).toHaveAttribute("href", "/");
  });
  it("links to the legal pages and dedicated support address", () => {
    render(<Footer />);

    const navigation = within(
      screen.getByRole("navigation", {
        name: "Legal and support",
      }),
    );

    expect(
      navigation.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");

    expect(
      navigation.getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "/terms");

    expect(
      navigation.getByRole("link", { name: "Contact support" }),
    ).toHaveAttribute("href", "mailto:stackwingjobs.support@gmail.com");
  });
});
