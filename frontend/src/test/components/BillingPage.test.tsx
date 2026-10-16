import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingPage from "../../app/billing/page";

const mocks = vi.hoisted(() => ({
  signedIn: true,
  clerk: {
    user: { id: "user_billing_test" },
    session: {
      id: "session_billing_test",
      getToken: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: mocks.signedIn,
    userId: mocks.signedIn ? mocks.clerk.user.id : null,
    sessionId: mocks.signedIn ? mocks.clerk.session.id : null,
  }),
  useClerk: () => mocks.clerk,
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const fetchMock = vi.fn<typeof fetch>();

const inactive = {
  premium: false,
  customerExists: false,
  blocked: false,
  status: "none",
  paidUntil: null,
  cancelAtPeriodEnd: false,
  mode: "test",
  price: {
    amount: 199,
    currency: "usd",
    interval: "month",
  },
};

const active = {
  ...inactive,
  premium: true,
  customerExists: true,
  status: "active",
  paidUntil: "2099-01-01T00:00:00.000Z",
};

const pending = {
  ...active,
  premium: false,
  paidUntil: null,
};

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mocks.signedIn = true;

  mocks.clerk.session.getToken.mockReset().mockResolvedValue("test-token");

  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply(inactive));

  vi.stubGlobal("fetch", fetchMock);

  window.history.replaceState({}, "", "/billing");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Billing status synchronization", () => {
  it("does not request billing while signed out", () => {
    mocks.signedIn = false;

    render(<BillingPage />);

    expect(
      screen.getByRole("button", {
        name: "Sign in to continue",
      }),
    ).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows checkout for a verified account without a subscription", async () => {
    render(<BillingPage />);

    expect(
      await screen.findByRole("button", {
        name: "Continue to checkout",
      }),
    ).toBeDisabled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("checks Stripe before showing checkout for an existing billing customer", async () => {
    let resolveRefresh!: (value: Response) => void;

    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    fetchMock
      .mockResolvedValueOnce(reply(pending))
      .mockReturnValueOnce(refreshResponse);

    render(<BillingPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(
      screen.getByRole("status", {
        name: "Checking subscription",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Continue to checkout",
      }),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveRefresh(reply(active));
    });

    expect(await screen.findByText("Pro active")).toBeInTheDocument();
  });

  it("refreshes automatically when the window receives focus", async () => {
    render(<BillingPage />);

    await screen.findByRole("button", {
      name: "Continue to checkout",
    });

    fetchMock.mockResolvedValue(reply(active));

    fireEvent.focus(window);

    expect(await screen.findByText("Pro active")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Continue to checkout",
      }),
    ).not.toBeInTheDocument();

    expect(fetchMock.mock.calls[1]![1]?.method).toBe("POST");

    expect(String(fetchMock.mock.calls[1]![0])).toContain(
      "/api/billing/refresh",
    );
  });

  it("does not start competing refreshes for focus and visibility events", async () => {
    render(<BillingPage />);

    await screen.findByRole("button", {
      name: "Continue to checkout",
    });

    let resolveRefresh!: (value: Response) => void;

    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    fetchMock.mockReturnValueOnce(refreshResponse);

    fireEvent.focus(window);

    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveRefresh(reply(active));
    });

    expect(await screen.findByText("Pro active")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not refresh a hidden tab", async () => {
    render(<BillingPage />);

    await screen.findByRole("button", {
      name: "Continue to checkout",
    });

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    fireEvent.focus(window);

    fireEvent(document, new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies the checkout session before showing Pro", async () => {
    window.history.replaceState(
      {},
      "",
      "/billing?checkout=success&session_id=cs_test_paid",
    );

    fetchMock.mockResolvedValue(reply(active));

    render(<BillingPage />);

    expect(await screen.findByText("Pro active")).toBeInTheDocument();

    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/api/billing/confirm",
    );

    expect(fetchMock.mock.calls[0]![1]?.body).toBe(
      JSON.stringify({
        sessionId: "cs_test_paid",
      }),
    );

    expect(window.location.search).toBe("");
  });

  it("briefly retries an updating subscription without showing checkout", async () => {
    vi.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce(reply(pending))
      .mockResolvedValueOnce(reply(pending))
      .mockResolvedValueOnce(reply(active));

    render(<BillingPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      screen.getByRole("status", {
        name: "Checking subscription",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Continue to checkout",
      }),
    ).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByText("Pro active")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops retrying and does not show checkout when status remains uncertain", async () => {
    vi.useFakeTimers();

    fetchMock.mockResolvedValue(reply(pending));

    render(<BillingPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your subscription is still updating",
    );

    expect(
      screen.getByRole("button", {
        name: "Retry billing status",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Continue to checkout",
      }),
    ).not.toBeInTheDocument();

    // Initial status + four authoritative refresh attempts.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not retry a rejected authentication request", async () => {
    fetchMock.mockResolvedValue(reply({ message: "Sign in again." }, 401));

    render(<BillingPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in again.",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate initial work in Strict Mode", async () => {
    fetchMock.mockResolvedValue(reply(active));

    render(
      <StrictMode>
        <BillingPage />
      </StrictMode>,
    );

    expect(await screen.findByText("Pro active")).toBeInTheDocument();

    // One saved-status read and one authoritative refresh.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("removes automatic refresh listeners after unmount", async () => {
    const view = render(<BillingPage />);

    await screen.findByRole("button", {
      name: "Continue to checkout",
    });

    view.unmount();

    fireEvent.focus(window);

    fireEvent(document, new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
