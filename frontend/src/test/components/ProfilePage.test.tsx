import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "../../app/profile/page";

const mocks = vi.hoisted(() => ({
  useUser: vi.fn(),
  signIn: vi.fn(),
  userProfile: vi.fn(),
  signOutOptions: vi.fn(),
  signOutClick: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => {
  function MockUserProfile({
    children,
    ...props
  }: {
    children?: ReactNode;
    routing?: string;
    appearance?: unknown;
  }) {
    mocks.userProfile(props);

    return <div data-testid="account-panel">{children}</div>;
  }

  function MockProfilePage({
    label,
    url,
    children,
  }: {
    label: string;
    url?: string;
    children?: ReactNode;
    labelIcon?: ReactNode;
  }) {
    return (
      <section aria-label={label} data-page-url={url}>
        {children}
      </section>
    );
  }

  return {
    useUser: mocks.useUser,

    SignIn: (props: unknown) => {
      mocks.signIn(props);
      return <div data-testid="signin-form">Sign-in form</div>;
    },

    UserProfile: Object.assign(MockUserProfile, {
      Page: MockProfilePage,
    }),

    SignOutButton: ({
      children,
      redirectUrl,
    }: {
      children: ReactNode;
      redirectUrl?: string;
    }) => {
      mocks.signOutOptions({ redirectUrl });

      return <div onClick={mocks.signOutClick}>{children}</div>;
    },
  };
});

function renderSignedInProfile() {
  mocks.useUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
  });

  return render(<ProfilePage />);
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "");

    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows loading while Clerk initializes", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    render(<ProfilePage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading account");
    expect(screen.queryByTestId("signin-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-panel")).not.toBeInTheDocument();
  });

  it("shows sign-in instead of account settings when signed out", () => {
    render(<ProfilePage />);

    expect(screen.getByTestId("signin-form")).toBeInTheDocument();
    expect(screen.queryByTestId("account-panel")).not.toBeInTheDocument();

    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: "hash",
        signUpUrl: "/sign-up",
        fallbackRedirectUrl: "/profile",
      }),
    );
  });

  it("shows account settings instead of sign-in when signed in", () => {
    renderSignedInProfile();

    expect(screen.getByTestId("account-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("signin-form")).not.toBeInTheDocument();
  });

  it("includes Clerk's account and security pages", () => {
    renderSignedInProfile();

    expect(screen.getByRole("region", { name: "account" })).toBeInTheDocument();

    expect(
      screen.getByRole("region", { name: "security" }),
    ).toBeInTheDocument();
  });

  it("includes all custom account sections", () => {
    renderSignedInProfile();

    const sections = [
      ["Pro subscription", "subscription"],
      ["Privacy", "privacy"],
      ["Help & feedback", "help"],
      ["Delete account", "delete-account"],
      ["Sign out", "sign-out"],
    ];

    for (const [label, url] of sections) {
      expect(screen.getByRole("region", { name: label })).toHaveAttribute(
        "data-page-url",
        url,
      );
    }
  });

  it("uses hash routing and expands the panel width", () => {
    renderSignedInProfile();

    expect(mocks.userProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: "hash",
        appearance: expect.objectContaining({
          elements: expect.objectContaining({
            rootBox: {
              width: "100%",
              maxWidth: "100%",
            },
            cardBox: {
              width: "100%",
              maxWidth: "100%",
            },
          }),
        }),
      }),
    );
  });

  it("does not show the removed outside Account settings heading", () => {
    renderSignedInProfile();

    expect(
      screen.queryByRole("heading", { name: "Account settings" }),
    ).not.toBeInTheDocument();
  });

  it("clearly identifies subscriptions as unavailable", () => {
    renderSignedInProfile();

    const subscription = screen.getByRole("region", {
      name: "Pro subscription",
    });

    expect(
      within(subscription).getByRole("heading", { name: "Dev Jobs Pro" }),
    ).toBeInTheDocument();

    expect(within(subscription).getByText("Coming soon")).toBeInTheDocument();
    expect(subscription).toHaveTextContent(
      "Paid subscriptions are not available yet.",
    );
  });

  it("includes the privacy explanations", () => {
    renderSignedInProfile();

    const privacy = screen.getByRole("region", { name: "Privacy" });

    expect(
      within(privacy).getByRole("heading", { name: "Account information" }),
    ).toBeInTheDocument();

    expect(
      within(privacy).getByRole("heading", { name: "Profile visibility" }),
    ).toBeInTheDocument();

    expect(
      within(privacy).getByRole("heading", { name: "Job browsing" }),
    ).toBeInTheDocument();
  });

  it("shows all support categories", () => {
    renderSignedInProfile();

    const help = screen.getByRole("region", { name: "Help & feedback" });

    for (const title of [
      "Broken job link",
      "Report a bug",
      "Subscription issue",
    ]) {
      expect(
        within(help).getByRole("heading", { name: title }),
      ).toBeInTheDocument();
    }
  });

  it("does not create support links without a configured email", () => {
    renderSignedInProfile();

    expect(
      screen.queryByRole("link", { name: "Email support" }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Support contact details have not been configured yet."),
    ).toBeInTheDocument();
  });

  it("creates support emails with the correct address and subjects", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "  support@example.com  ");

    renderSignedInProfile();

    const links = screen.getAllByRole("link", { name: "Email support" });

    expect(links).toHaveLength(3);

    const subjects = [
      "Dev Jobs: Broken job link",
      "Dev Jobs: Report a bug",
      "Dev Jobs: Subscription issue",
    ];

    links.forEach((link, index) => {
      const url = new URL(link.getAttribute("href")!);

      expect(url.protocol).toBe("mailto:");
      expect(url.pathname).toBe("support@example.com");
      expect(url.searchParams.get("subject")).toBe(subjects[index]);
      expect(url.searchParams.get("body")).toContain("Details:");
    });
  });

  it("treats a whitespace-only support email as unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "   ");

    renderSignedInProfile();

    expect(
      screen.queryByRole("link", { name: "Email support" }),
    ).not.toBeInTheDocument();
  });

  it("keeps account deletion disabled until the backend is connected", () => {
    renderSignedInProfile();

    expect(
      screen.getByRole("button", {
        name: "Delete account — unavailable",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("heading", {
        name: "Account deletion is not connected yet",
      }),
    ).toBeInTheDocument();
  });

  it("places sign-out inside the panel and delegates to Clerk", async () => {
    const user = userEvent.setup();

    renderSignedInProfile();

    const signOutSection = screen.getByRole("region", {
      name: "Sign out",
    });

    await user.click(
      within(signOutSection).getByRole("button", {
        name: "Sign out",
      }),
    );

    expect(mocks.signOutClick).toHaveBeenCalledTimes(1);
    expect(mocks.signOutOptions).toHaveBeenCalledWith({
      redirectUrl: "/",
    });
  });

  it("removes the account panel when the session becomes signed out", () => {
    const { rerender } = renderSignedInProfile();

    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    rerender(<ProfilePage />);

    expect(screen.queryByTestId("account-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("signin-form")).toBeInTheDocument();
  });

  it("uses Dev Jobs branding instead of DVjobs", () => {
    const { container } = renderSignedInProfile();

    expect(container).toHaveTextContent("Dev Jobs");
    expect(container.textContent).not.toContain("DVjobs");
  });
});
