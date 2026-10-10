import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignUpPage from "../../app/sign-up/[[...sign-up]]/page";

const mocks = vi.hoisted(() => ({
  useUser: vi.fn(),
  replace: vi.fn(),
  signUp: vi.fn(),
}));

const router = {
  replace: mocks.replace,
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: mocks.useUser,
  SignUp: (props: unknown) => {
    mocks.signUp(props);
    return <div data-testid="signup-form">Signup form</div>;
  },
}));

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading while Clerk initializes", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });

    render(<SignUpPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading account");
    expect(screen.queryByTestId("signup-form")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("renders signup when signed out", () => {
    render(<SignUpPage />);

    expect(screen.getByTestId("signup-form")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("uses the correct signup routes", () => {
    render(<SignUpPage />);

    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: "path",
        path: "/sign-up",
        signInUrl: "/sign-in",
        fallbackRedirectUrl: "/profile",
      }),
    );
  });

  it("provides a fallback while the Clerk form mounts", () => {
    render(<SignUpPage />);

    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        fallback: expect.anything(),
      }),
    );
  });

  it("redirects signed-in users to Profile without rendering signup", async () => {
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<SignUpPage />);

    expect(screen.queryByTestId("signup-form")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/profile");
    });
  });

  it("handles a user signing in after the page loads", async () => {
    const { rerender } = render(<SignUpPage />);

    expect(screen.getByTestId("signup-form")).toBeInTheDocument();

    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    rerender(<SignUpPage />);

    expect(screen.queryByTestId("signup-form")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/profile");
    });
  });

  it("does not display the removed recovery button", () => {
    render(<SignUpPage />);

    expect(
      screen.queryByRole("button", { name: "Restart signup" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Having trouble completing signup?"),
    ).not.toBeInTheDocument();
  });

  it("registers history recovery listeners and removes them on unmount", () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<SignUpPage />);

    const popstateListener = addListener.mock.calls.find(
      ([event]) => event === "popstate",
    )?.[1];

    const pageshowListener = addListener.mock.calls.find(
      ([event]) => event === "pageshow",
    )?.[1];

    expect(popstateListener).toEqual(expect.any(Function));
    expect(pageshowListener).toEqual(expect.any(Function));

    unmount();

    expect(removeListener).toHaveBeenCalledWith("popstate", popstateListener);

    expect(removeListener).toHaveBeenCalledWith("pageshow", pageshowListener);
  });
});
