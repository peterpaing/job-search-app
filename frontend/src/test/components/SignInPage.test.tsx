import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage from "../../app/sign-in/[[...sign-in]]/page";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: unknown) => {
    mocks.signIn(props);
    return <div data-testid="signin-form">Sign-in form</div>;
  },
}));

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Clerk sign-in form", () => {
    render(<SignInPage />);

    expect(screen.getByTestId("signin-form")).toBeInTheDocument();
  });

  it("uses the correct sign-in and signup routes", () => {
    render(<SignInPage />);

    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: "path",
        path: "/sign-in",
        signUpUrl: "/sign-up",
        fallbackRedirectUrl: "/profile",
      }),
    );
  });
});
