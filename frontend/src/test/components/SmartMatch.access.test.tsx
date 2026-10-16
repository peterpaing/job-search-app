import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmartMatchPage from "../../app/smart-match/page";

const mocks = vi.hoisted(() => ({
  clerk: {
    user: {
      id: "user_access_test",
    },
    session: {
      id: "session_access_test",
      getToken: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: mocks.clerk.user.id,
    sessionId: mocks.clerk.session.id,
  }),
  useClerk: () => mocks.clerk,
}));

vi.mock("../../app/component/PremiumPreview", () => ({
  default: () => <div data-testid="purchase-preview">Buy Pro</div>,
}));

vi.mock("../../app/component/SmartMatchUsage", () => ({
  default: () => null,
}));

vi.mock("../../app/component/SmartMatchChat", () => ({
  default: () => null,
}));

const fetchMock = vi.fn<typeof fetch>();

const paidAccess = {
  premium: true,
  aiEnabled: true,
  dailyLimit: 20,
};

function bootstrap(premium: boolean) {
  return {
    access: {
      ...paidAccess,
      premium,
    },
    profile: null,
    usage: null,
    matches: [],
    searched: 0,
  };
}

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mocks.clerk.session.getToken.mockReset().mockResolvedValue("test-token");

  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply(bootstrap(true)));

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SmartMatch subscription verification", () => {
  it("does not show Buy Pro while access is being checked", async () => {
    let resolveRequest!: (value: Response) => void;

    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<SmartMatchPage />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("status", {
        name: "Loading SmartMatch",
      }),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("purchase-preview")).not.toBeInTheDocument();

    await act(async () => {
      resolveRequest(reply(bootstrap(true)));
    });

    expect(
      await screen.findByRole("navigation", {
        name: "SmartMatch views",
      }),
    ).toBeInTheDocument();
  });

  it("shows the purchase preview only after a confirmed non-premium response", async () => {
    fetchMock.mockResolvedValue(reply(bootstrap(false)));

    render(<SmartMatchPage />);

    expect(await screen.findByTestId("purchase-preview")).toBeInTheDocument();
  });

  it("retries temporary verification errors without showing Buy Pro", async () => {
    vi.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce(
        reply(
          {
            message: "Subscription verification is updating.",
          },
          503,
        ),
      )
      .mockResolvedValueOnce(reply(bootstrap(true)));

    render(<SmartMatchPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByTestId("purchase-preview")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(
      screen.getByRole("navigation", {
        name: "SmartMatch views",
      }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a retry error rather than Buy Pro when verification stays unavailable", async () => {
    vi.useFakeTimers();

    fetchMock.mockResolvedValue(
      reply(
        {
          message: "Subscription verification is updating.",
        },
        503,
      ),
    );

    render(<SmartMatchPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Subscription verification is updating.",
    );

    expect(
      screen.getByRole("button", {
        name: "Try again",
      }),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("purchase-preview")).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rechecks access when returning after payment", async () => {
    fetchMock.mockResolvedValueOnce(reply(bootstrap(false)));

    render(<SmartMatchPage />);

    await screen.findByTestId("purchase-preview");

    fetchMock.mockResolvedValue(reply(bootstrap(true)));

    fireEvent.focus(window);

    expect(
      await screen.findByRole("navigation", {
        name: "SmartMatch views",
      }),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("purchase-preview")).not.toBeInTheDocument();
  });

  it("preserves unsaved resume text when rechecking paid access", async () => {
    render(<SmartMatchPage />);

    const resume = await screen.findByLabelText("Resume text");

    fireEvent.change(resume, {
      target: {
        value: "My unsaved developer experience.",
      },
    });

    fetchMock.mockResolvedValue(reply(paidAccess));

    fireEvent.focus(window);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Resume text")).toHaveValue(
      "My unsaved developer experience.",
    );
  });

  it("shows the purchase preview after the backend confirms access has ended", async () => {
    render(<SmartMatchPage />);

    await screen.findByRole("navigation", {
      name: "SmartMatch views",
    });

    fetchMock.mockResolvedValue(
      reply({
        ...paidAccess,
        premium: false,
      }),
    );

    fireEvent.focus(window);

    expect(await screen.findByTestId("purchase-preview")).toBeInTheDocument();
  });
});
