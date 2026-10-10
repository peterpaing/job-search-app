import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import Navbar from "../../app/component/Navbar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props} onClick={(event) => event.preventDefault()}>
      {children}
    </a>
  ),
}));

describe("Navbar", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/");
  });

  it("renders the logo and navigation destinations", () => {
    render(<Navbar />);

    expect(screen.getByRole("img", { name: "Logo" })).toBeInTheDocument();

    const links = [
      ["Explore", "/"],
      ["Saved", "/saved-jobs"],
      ["Application", "/tracker"],
      ["SmartMatch", "/smart-match"],
      ["Profile", "/profile"],
    ];

    for (const [name, href] of links) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("starts with the menu collapsed", () => {
    render(<Navbar />);

    const button = screen.getByRole("button", { name: "Open navigation" });
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", navigation.id);
    expect(navigation).toHaveClass("hidden");
  });

  it("opens and closes the menu when the button is clicked", async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const closeButton = screen.getByRole("button", {
      name: "Close navigation",
    });

    expect(closeButton).toHaveAttribute("aria-expanded", "true");
    expect(navigation).toHaveClass("flex");
    expect(navigation).not.toHaveClass("hidden");

    await user.click(closeButton);

    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(navigation).toHaveClass("hidden");
  });

  it("closes the menu when nested content inside a link is clicked", async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    await user.click(screen.getByText("SmartMatch"));

    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "false");

    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveClass("hidden");
  });
});
