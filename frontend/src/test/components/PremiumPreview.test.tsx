import { render, screen, within } from "@testing-library/react";
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

  it("shows the monthly price and benefits", () => {
    render(<PremiumPreview signedIn />);

    expect(screen.getByText("$1.99")).toBeInTheDocument();
    expect(screen.getByText("/ month")).toBeInTheDocument();

    expect(
      screen.getByText("Monthly price in USD. AI usage limits apply."),
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

  it("sends signed-in users to billing and explains renewal", () => {
    render(<PremiumPreview signedIn />);

    expect(
      screen.getByRole("link", { name: "Upgrade to Pro" }),
    ).toHaveAttribute("href", "/billing");

    expect(
      screen.getByRole("link", { name: "Manage billing" }),
    ).toHaveAttribute("href", "/billing");

    expect(
      screen.getByText("Renews monthly until cancelled."),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Cancel future renewals from your billing page."),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Payment details are handled by Stripe"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Payments coming soon" }),
    ).not.toBeInTheDocument();
  });

  it("preserves free browsing without showing sign-in to signed-in users", () => {
    render(<PremiumPreview signedIn />);

    expect(screen.getByRole("link", { name: "Explore jobs" })).toHaveAttribute(
      "href",
      "/",
    );

    expect(
      screen.queryByRole("button", { name: "Sign in to upgrade" }),
    ).not.toBeInTheDocument();

    expect(mocks.signInOptions).not.toHaveBeenCalled();
  });

  it("requires sign-in before sending signed-out users to billing", () => {
    render(<PremiumPreview signedIn={false} />);

    expect(
      screen.getByRole("button", { name: "Sign in to upgrade" }),
    ).toBeEnabled();

    expect(mocks.signInOptions).toHaveBeenCalledWith({
      mode: "modal",
      forceRedirectUrl: "/billing",
    });

    expect(
      screen.queryByRole("link", { name: "Upgrade to Pro" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("link", { name: "Manage billing" }),
    ).not.toBeInTheDocument();
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
