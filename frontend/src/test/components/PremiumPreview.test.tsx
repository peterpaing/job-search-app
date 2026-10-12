import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PremiumPreview from "../../app/component/PremiumPreview";

const mocks = vi.hoisted(() => ({
  signInOptions: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({
    children,
    ...options
  }: {
    children: ReactNode;
    mode?: string;
    forceRedirectUrl?: string;
  }) => {
    mocks.signInOptions(options);
    return <>{children}</>;
  },
}));

describe("PremiumPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the planned monthly price and benefits", () => {
    render(<PremiumPreview signedIn />);

    expect(screen.getByText("$1.99")).toBeInTheDocument();
    expect(screen.getByText("/ month")).toBeInTheDocument();

    expect(
      screen.getByText("Planned monthly price in USD."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Find more relevant roles",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Get clarity before applying",
      }),
    ).toBeInTheDocument();
  });

  it("keeps payment unavailable", async () => {
    const user = userEvent.setup();

    render(<PremiumPreview signedIn />);

    const button = screen.getByRole("button", {
      name: "Payments coming soon",
    });

    expect(button).toBeDisabled();

    await user.click(button);

    expect(
      screen.getByText("No checkout or payment is available yet."),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("link", {
        name: /buy|subscribe/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("preserves the access notice and free browsing", () => {
    render(<PremiumPreview signedIn />);

    expect(screen.getByText("Premium access required")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Explore jobs" })).toHaveAttribute(
      "href",
      "/",
    );

    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
  });

  it("offers sign-in without unlocking paid access", () => {
    render(<PremiumPreview signedIn={false} />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();

    expect(mocks.signInOptions).toHaveBeenCalledWith({
      mode: "modal",
      forceRedirectUrl: "/smart-match",
    });

    expect(
      screen.getByRole("button", {
        name: "Payments coming soon",
      }),
    ).toBeDisabled();
  });

  it("keeps saving and tracking available on Free", () => {
    render(<PremiumPreview signedIn />);

    const row = screen.getByRole("row", {
      name: /Save jobs and track applications/,
    });

    expect(within(row).getAllByText("Included")).toHaveLength(2);
  });

  it("shows AI assistance as a Pro feature with usage limits", () => {
    render(<PremiumPreview signedIn />);

    const row = screen.getByRole("row", {
      name: /Job-specific AI assistance/,
    });

    expect(within(row).getByText("Not included")).toBeInTheDocument();

    expect(within(row).getByText("Included")).toBeInTheDocument();

    expect(
      screen.getByText(/AI usage limits apply to Pro/),
    ).toBeInTheDocument();
  });
});
