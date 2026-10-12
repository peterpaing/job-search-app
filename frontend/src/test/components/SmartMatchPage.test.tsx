import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmartMatchPage from "../../app/smart-match/page";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
  clerk: {
    user: { id: "user-a" },
    session: {
      id: "session-a",
      getToken: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: mocks.useAuth,
  useClerk: () => mocks.clerk,
  SignInButton: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("../../app/component/JobCard", () => ({
  default: ({ job }: { job: { title: string } }) => (
    <article>{job.title}</article>
  ),
}));

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const usage = {
  used: 0,
  limit: 20,
  remaining: 20,
  resetsAt: "2026-10-13T00:00:00.000Z",
};

describe("SmartMatchPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user-a",
      sessionId: "session-a",
    });

    mocks.clerk.user = { id: "user-a" };
    mocks.clerk.session.id = "session-a";
    mocks.clerk.session.getToken.mockResolvedValue("verified-token");

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows skeletons while authentication loads", () => {
    mocks.useAuth.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      userId: null,
      sessionId: null,
    });

    render(<SmartMatchPage />);

    expect(
      screen.getByRole("status", { name: "Loading SmartMatch" }),
    ).toHaveAttribute("aria-busy", "true");

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("shows sign-in without making private requests when signed out", () => {
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
    });

    render(<SmartMatchPage />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByText("Paid subscriptions are coming soon."),
    ).toBeInTheDocument();

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("shows a locked preview for non-premium accounts", async () => {
    mocks.fetch.mockResolvedValue(
      response({
        premium: false,
        aiEnabled: true,
        dailyLimit: 20,
      }),
    );

    render(<SmartMatchPage />);

    expect(
      await screen.findByText("Premium access required"),
    ).toBeInTheDocument();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Resume text")).not.toBeInTheDocument();
  });

  it("opens profile setup for premium users without generating AI", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        response({
          premium: true,
          aiEnabled: true,
          dailyLimit: 20,
        }),
      )
      .mockResolvedValueOnce(response({ profile: null, usage }));

    render(<SmartMatchPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Review your developer profile",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Extract with AI" }),
    ).toBeDisabled();

    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    for (const [url] of mocks.fetch.mock.calls) {
      expect(String(url)).not.toContain("/extract");
      expect(String(url)).not.toContain("/ask");
    }
  });

  it("requires consent before extraction", async () => {
    const user = userEvent.setup();

    mocks.fetch
      .mockResolvedValueOnce(
        response({
          premium: true,
          aiEnabled: true,
          dailyLimit: 20,
        }),
      )
      .mockResolvedValueOnce(response({ profile: null, usage }));

    render(<SmartMatchPage />);

    const resume = await screen.findByLabelText("Resume text");

    await user.type(
      resume,
      "Frontend developer experienced in React and TypeScript applications.",
    );

    expect(
      screen.getByRole("button", { name: "Extract with AI" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", {
        name: /I agree to send this text to OpenAI/i,
      }),
    );

    expect(
      screen.getByRole("button", { name: "Extract with AI" }),
    ).toBeEnabled();
  });

  it("saves manual preferences without an AI request", async () => {
    const user = userEvent.setup();

    const profile = {
      skills: ["React", "TypeScript"],
      roles: [],
      experience: "not-specified",
      location: "",
      workMode: "any",
    };

    mocks.fetch
      .mockResolvedValueOnce(
        response({
          premium: true,
          aiEnabled: true,
          dailyLimit: 20,
        }),
      )
      .mockResolvedValueOnce(response({ profile: null, usage }))
      .mockResolvedValueOnce(response({ profile, usage }))
      .mockResolvedValueOnce(response({ matches: [], searched: 0 }));

    render(<SmartMatchPage />);

    await user.type(
      await screen.findByLabelText("Skills"),
      "React, TypeScript",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Save profile and find matches",
      }),
    );

    await screen.findByRole("heading", { name: "No matching jobs yet" });

    const putCall = mocks.fetch.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );

    expect(putCall).toBeDefined();

    expect(JSON.parse(putCall?.[1].body as string)).toEqual(profile);

    for (const [url] of mocks.fetch.mock.calls) {
      expect(String(url)).not.toContain("/extract");
      expect(String(url)).not.toContain("/ask");
    }
  });

  it("shows retry controls if access cannot load", async () => {
    mocks.fetch.mockResolvedValue(
      response({ message: "Connection unavailable." }, 503),
    );

    render(<SmartMatchPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Couldn’t load SmartMatch",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("discards an access result belonging to the previous account", async () => {
    let resolveFirst:
      ((value: ReturnType<typeof response>) => void) | undefined;

    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { rerender } = render(<SmartMatchPage />);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    mocks.clerk.user = { id: "user-b" };
    mocks.clerk.session.id = "session-b";

    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user-b",
      sessionId: "session-b",
    });

    mocks.fetch.mockResolvedValueOnce(
      response({
        premium: false,
        aiEnabled: true,
        dailyLimit: 20,
      }),
    );

    rerender(<SmartMatchPage />);

    resolveFirst?.(
      response({
        premium: true,
        aiEnabled: true,
        dailyLimit: 20,
      }),
    );

    expect(
      await screen.findByText("Premium access required"),
    ).toBeInTheDocument();

    expect(screen.queryByLabelText("Resume text")).not.toBeInTheDocument();
  });
});
