import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  clerkSignOut: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
  useClerk: vi.fn(),
  reverify: vi.fn(),
  isCancelled: vi.fn(),
  replaceLocation: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.routerReplace,
    refresh: mocks.routerRefresh,
  }),
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

    // These component tests do not exercise Clerk's real
    // reverification UI or backend verification.
    useClerk: mocks.useClerk,

    // Exercise our handling without opening Clerk's real verification UI.
    useReverification:
      (fetcher: (...args: string[]) => Promise<unknown>) =>
      (...args: string[]) =>
        mocks.reverify(fetcher, ...args),

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

vi.mock("@clerk/nextjs/errors", () => ({
  isReverificationCancelledError: mocks.isCancelled,
}));

let profileClerk: {
  user: { id: string } | null;
  session: {
    id: string;
    getToken: typeof mocks.getToken;
  } | null;
  signOut: typeof mocks.clerkSignOut;
};

function renderSignedInProfile() {
  mocks.useUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
  });

  return render(<ProfilePage />);
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    profileClerk = {
      user: { id: "user_profile_test" },
      session: {
        id: "session_profile_test",
        getToken: mocks.getToken,
      },
      signOut: mocks.clerkSignOut,
    };

    mocks.useClerk.mockReturnValue(profileClerk);

    mocks.reverify.mockImplementation(
      (fetcher: (...args: string[]) => Promise<unknown>, ...args: string[]) =>
        fetcher(...args),
    );

    mocks.isCancelled.mockReturnValue(false);

    // jsdom cannot perform a real page reload.
    // Intercept only the navigation call; preserve the real document.
    const browserWindow = window;
    const navigation = {
      href: browserWindow.location.href,
      origin: browserWindow.location.origin,
      pathname: browserWindow.location.pathname,
      search: browserWindow.location.search,
      hash: browserWindow.location.hash,
      replace: mocks.replaceLocation,
    };

    vi.stubGlobal(
      "window",
      new Proxy(browserWindow, {
        get(target, property) {
          if (property === "location") return navigation;
          return Reflect.get(target, property, target);
        },
      }),
    );
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5000");

    vi.stubGlobal("fetch", mocks.fetch);

    mocks.fetch.mockRejectedValue(
      new Error("Unexpected network request in ProfilePage test"),
    );

    mocks.getToken.mockResolvedValue("local-test-token");
    mocks.clerkSignOut.mockResolvedValue(undefined);

    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
      screen.queryByRole("heading", {
        name: "Account settings",
      }),
    ).not.toBeInTheDocument();
  });

  it("provides billing management and explains cancellation", () => {
    renderSignedInProfile();

    const subscription = screen.getByRole("region", {
      name: "Pro subscription",
    });

    expect(
      within(subscription).getByRole("heading", {
        name: "StackWing Pro",
      }),
    ).toBeInTheDocument();

    expect(
      within(subscription).getByRole("link", {
        name: "Open billing & subscription",
      }),
    ).toHaveAttribute("href", "/billing");

    expect(subscription).toHaveTextContent(
      "Cancellation stops future renewals.",
    );

    expect(subscription).toHaveTextContent(
      "Your Pro access continues until the paid period ends.",
    );

    expect(subscription).toHaveTextContent(
      "Existing AI allowances still apply.",
    );

    expect(
      within(subscription).queryByText("Coming soon"),
    ).not.toBeInTheDocument();
  });

  it("includes the privacy explanations", () => {
    renderSignedInProfile();

    const privacy = screen.getByRole("region", {
      name: "Privacy",
    });

    for (const title of [
      "Account information",
      "Profile visibility",
      "Job browsing",
      "Payments and subscriptions",
    ]) {
      expect(
        within(privacy).getByRole("heading", { name: title }),
      ).toBeInTheDocument();
    }
  });

  it("shows support categories in the requested order", () => {
    renderSignedInProfile();

    const help = screen.getByRole("region", {
      name: "Help & feedback",
    });

    const headings = within(help).getAllByRole("heading", {
      level: 3,
    });

    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Subscription issue",
      "AI issue",
      "Report a bug",
    ]);

    expect(
      within(help).queryByRole("heading", {
        name: "Broken job link",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not create support links without a configured email", () => {
    renderSignedInProfile();

    expect(
      screen.queryByRole("link", {
        name: "Email support",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Support contact details have not been configured yet."),
    ).toBeInTheDocument();
  });

  it("creates Gmail drafts with the correct recipient and subjects", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "  support@example.com  ");

    renderSignedInProfile();

    const links = screen.getAllByRole("link", {
      name: "Email support",
    });

    expect(links).toHaveLength(3);

    const subjects = [
      "StackWing: Subscription issue",
      "StackWing: AI issue",
      "StackWing: Report a bug",
    ];

    links.forEach((link, index) => {
      const href = link.getAttribute("href");

      expect(href).not.toBeNull();

      const url = new URL(href!);

      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("mail.google.com");
      expect(url.pathname).toBe("/mail/");
      expect(url.searchParams.get("tf")).toBe("cm");
      expect(url.searchParams.get("to")).toBe("support@example.com");
      expect(url.searchParams.get("su")).toBe(subjects[index]);
      expect(url.searchParams.get("body")).toContain("Details:");

      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only support email as unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "   ");

    renderSignedInProfile();

    expect(
      screen.queryByRole("link", {
        name: "Email support",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps account deletion disabled when the feature flag is off", () => {
    renderSignedInProfile();

    const deletion = screen.getByRole("region", {
      name: "Delete account",
    });

    expect(
      within(deletion).getByRole("heading", {
        name: "Permanently delete your account",
      }),
    ).toBeInTheDocument();

    expect(
      within(deletion).getByLabelText("Type DELETE to confirm"),
    ).toBeDisabled();

    expect(
      within(deletion).getByRole("button", {
        name: "Delete account",
      }),
    ).toBeDisabled();

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("requires the exact DELETE confirmation when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED", "true");

    const user = userEvent.setup();
    renderSignedInProfile();

    const deletion = screen.getByRole("region", {
      name: "Delete account",
    });

    const input = within(deletion).getByLabelText("Type DELETE to confirm");

    const button = within(deletion).getByRole("button", {
      name: "Delete account",
    });

    expect(button).toBeDisabled();

    await user.type(input, "delete");
    expect(button).toBeDisabled();

    await user.clear(input);
    await user.type(input, "DELETE");

    expect(button).toBeEnabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("submits confirmation and signs out after a queued response", async () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED", "true");

    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "pending" }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const user = userEvent.setup();
    renderSignedInProfile();

    const deletion = screen.getByRole("region", {
      name: "Delete account",
    });

    await user.type(
      within(deletion).getByLabelText("Type DELETE to confirm"),
      "DELETE",
    );

    await user.click(
      within(deletion).getByRole("button", {
        name: "Delete account",
      }),
    );

    await waitFor(() => {
      expect(mocks.clerkSignOut).toHaveBeenCalledWith({
        sessionId: "session_profile_test",
      });
    });

    expect(mocks.getToken).toHaveBeenCalledWith({
      skipCache: true,
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = mocks.fetch.mock.calls[0];

    expect(String(url)).toBe("http://localhost:5000/api/account/deletion");

    expect(options).toEqual(
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: "Bearer local-test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation: "DELETE",
        }),
      }),
    );

    expect(within(deletion).getByRole("status")).toHaveTextContent(
      "Your deletion request is saved.",
    );
  });

  it("shows a rejected deletion request without signing out", async () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED", "true");

    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "An AI or billing request is still running.",
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const user = userEvent.setup();
    renderSignedInProfile();

    const deletion = screen.getByRole("region", {
      name: "Delete account",
    });

    await user.type(
      within(deletion).getByLabelText("Type DELETE to confirm"),
      "DELETE",
    );

    await user.click(
      within(deletion).getByRole("button", {
        name: "Delete account",
      }),
    );

    expect(await within(deletion).findByRole("alert")).toHaveTextContent(
      "An AI or billing request is still running.",
    );

    expect(mocks.clerkSignOut).not.toHaveBeenCalled();
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

  it("uses StackWing branding instead of the old names", () => {
    const { container } = renderSignedInProfile();

    expect(container).toHaveTextContent("StackWing");
    expect(container.textContent).not.toMatch(/Dev Jobs|DVjobs/i);
  });

  describe("deletion navigation and account safety", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED", "true");

      mocks.fetch.mockResolvedValue(
        new Response(JSON.stringify({ status: "pending" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    async function clickDelete() {
      const user = userEvent.setup();
      const deletion = screen.getByRole("region", {
        name: "Delete account",
      });

      await user.type(
        within(deletion).getByLabelText("Type DELETE to confirm"),
        "DELETE",
      );

      await user.click(
        within(deletion).getByRole("button", {
          name: "Delete account",
        }),
      );
    }

    it.each(["pending", "completed"])(
      "signs out before requesting a full home reload for %s",
      async (status) => {
        mocks.fetch.mockResolvedValue(
          new Response(JSON.stringify({ status }), {
            status: status === "completed" ? 200 : 202,
            headers: { "Content-Type": "application/json" },
          }),
        );

        renderSignedInProfile();
        await clickDelete();

        await waitFor(() => {
          expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(
            new URL("/", window.location.origin).href,
          );
        });

        expect(mocks.clerkSignOut).toHaveBeenCalledExactlyOnceWith({
          sessionId: "session_profile_test",
        });

        expect(mocks.clerkSignOut.mock.invocationCallOrder[0]).toBeLessThan(
          mocks.replaceLocation.mock.invocationCallOrder[0],
        );
      },
    );

    it("waits for sign-out to settle before navigating", async () => {
      let finishSignOut!: () => void;

      mocks.clerkSignOut.mockReturnValue(
        new Promise<void>((resolve) => {
          finishSignOut = resolve;
        }),
      );

      renderSignedInProfile();
      await clickDelete();

      await waitFor(() => {
        expect(mocks.clerkSignOut).toHaveBeenCalledTimes(1);
      });

      expect(mocks.replaceLocation).not.toHaveBeenCalled();

      await act(async () => {
        finishSignOut();
      });

      expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(
        new URL("/", window.location.origin).href,
      );
    });

    it("still navigates if the deleted session cannot be signed out again", async () => {
      mocks.clerkSignOut.mockRejectedValue(
        new Error("Session already removed"),
      );

      renderSignedInProfile();
      await clickDelete();

      await waitFor(() => {
        expect(mocks.replaceLocation).toHaveBeenCalledTimes(1);
      });

      expect(mocks.clerkSignOut).toHaveBeenCalledWith({
        sessionId: "session_profile_test",
      });
    });

    it("navigates when sign-out removes the current session", async () => {
      mocks.clerkSignOut.mockImplementation(async () => {
        profileClerk.session = null;
        profileClerk.user = null;
      });

      renderSignedInProfile();
      await clickDelete();

      await waitFor(() => {
        expect(mocks.replaceLocation).toHaveBeenCalledTimes(1);
      });
    });

    it("does not navigate when the backend rejects deletion", async () => {
      mocks.fetch.mockResolvedValue(
        new Response(JSON.stringify({ message: "Deletion is unavailable." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      );

      renderSignedInProfile();
      await clickDelete();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Deletion is unavailable.",
      );

      expect(mocks.clerkSignOut).not.toHaveBeenCalled();
      expect(mocks.replaceLocation).not.toHaveBeenCalled();
    });

    it("leaves the account unchanged when verification is canceled", async () => {
      const cancellation = new Error("Verification canceled");

      mocks.reverify.mockRejectedValue(cancellation);
      mocks.isCancelled.mockImplementation(
        (error: unknown) => error === cancellation,
      );

      renderSignedInProfile();
      await clickDelete();

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Delete account" }),
        ).toBeEnabled();
      });

      expect(mocks.reverify).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.clerkSignOut).not.toHaveBeenCalled();
      expect(mocks.replaceLocation).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("does not sign out a replacement account while deletion is pending", async () => {
      let finishRequest!: (response: Response) => void;

      mocks.fetch.mockReturnValue(
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
      );

      renderSignedInProfile();
      await clickDelete();

      await waitFor(() => {
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
      });

      profileClerk.user = { id: "user_replacement" };
      profileClerk.session = {
        id: "session_replacement",
        getToken: mocks.getToken,
      };

      await act(async () => {
        finishRequest(
          new Response(JSON.stringify({ status: "pending" }), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      expect(mocks.clerkSignOut).not.toHaveBeenCalled();
      expect(mocks.replaceLocation).not.toHaveBeenCalled();
    });

    it("does not navigate away from a replacement session during sign-out", async () => {
      let finishSignOut!: () => void;

      mocks.clerkSignOut.mockReturnValue(
        new Promise<void>((resolve) => {
          finishSignOut = resolve;
        }),
      );

      renderSignedInProfile();
      await clickDelete();

      await waitFor(() => {
        expect(mocks.clerkSignOut).toHaveBeenCalledTimes(1);
      });

      profileClerk.user = { id: "user_replacement" };
      profileClerk.session = {
        id: "session_replacement",
        getToken: mocks.getToken,
      };

      await act(async () => {
        finishSignOut();
      });

      expect(mocks.clerkSignOut).toHaveBeenCalledExactlyOnceWith({
        sessionId: "session_profile_test",
      });
      expect(mocks.replaceLocation).not.toHaveBeenCalled();
    });
  });
});
