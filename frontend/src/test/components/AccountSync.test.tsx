import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountSync from "../../app/component/AccountSync";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: mocks.useAuth,
}));

const errorMessage =
  "We couldn’t connect your account. You can still browse jobs.";

let timeoutController: AbortController;

function signedInAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: "user_test",
    sessionId: "session_test",
    getToken: mocks.getToken,
  };
}

// Combine real abort signals while controlling the timeout in tests.
function combineSignals(signals: AbortSignal[]) {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return controller.signal;
}

describe("AccountSync", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    timeoutController = new AbortController();

    vi.stubGlobal("fetch", mocks.fetch);

    vi.stubGlobal("AbortSignal", {
      any: combineSignals,
      timeout: vi.fn(() => timeoutController.signal),
    });

    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5000");

    mocks.useAuth.mockReturnValue(signedInAuth());
    mocks.getToken.mockResolvedValue("test-session-token");
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not sync while Clerk is loading", () => {
    mocks.useAuth.mockReturnValue({
      ...signedInAuth(),
      isLoaded: false,
    });

    render(<AccountSync />);

    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not sync while signed out", () => {
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      getToken: mocks.getToken,
    });

    render(<AccountSync />);

    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends the session token to the configured backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");

    render(<AccountSync />);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mocks.fetch.mock.calls[0];

    expect(String(url)).toBe("https://api.example.com/api/users/me");

    expect(options).toEqual({
      method: "POST",
      headers: {
        Authorization: "Bearer test-session-token",
      },
      cache: "no-store",
      signal: expect.any(Object),
    });

    // Identity must come from the verified token, not a body.
    expect(options).not.toHaveProperty("body");
  });

  it("does not show an error after a successful sync", async () => {
    render(<AccountSync />);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error without sending a request when no token exists", async () => {
    mocks.getToken.mockResolvedValue(null);

    render(<AccountSync />);

    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessage);

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("shows an error when getting the token fails", async () => {
    mocks.getToken.mockRejectedValue(new Error("Token unavailable"));

    render(<AccountSync />);

    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessage);

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([401, 500])(
    "shows a safe error when the backend returns %s",
    async (status) => {
      mocks.fetch.mockResolvedValue({
        ok: false,
        status,
      });

      render(<AccountSync />);

      expect(await screen.findByRole("alert")).toHaveTextContent(errorMessage);

      expect(
        screen.getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
    },
  );

  it("shows an error when the network request fails", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<AccountSync />);

    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessage);
  });

  it("retries with a fresh token and removes the error on success", async () => {
    const user = userEvent.setup();

    mocks.getToken
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("retry-token");

    mocks.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    render(<AccountSync />);

    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    expect(mocks.getToken).toHaveBeenCalledTimes(2);

    expect(mocks.fetch.mock.calls[1][1].headers).toEqual({
      Authorization: "Bearer retry-token",
    });
  });

  it("aborts an in-flight request when unmounted", async () => {
    mocks.fetch.mockImplementation(() => new Promise<Response>(() => {}));

    const { unmount } = render(<AccountSync />);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;

    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });

  it("does not start a request if unmounted before the token arrives", async () => {
    let resolveToken!: (token: string) => void;

    mocks.getToken.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
    );

    const { unmount } = render(<AccountSync />);

    unmount();

    await act(async () => {
      resolveToken("late-token");
    });

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("aborts the request when the user signs out", async () => {
    mocks.fetch.mockImplementation(() => new Promise<Response>(() => {}));

    const { rerender } = render(<AccountSync />);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;

    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      getToken: mocks.getToken,
    });

    rerender(<AccountSync />);

    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error when the request times out", async () => {
    mocks.fetch.mockImplementation(
      (_url: URL, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    render(<AccountSync />);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    act(() => {
      timeoutController.abort();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessage);
  });
});
