import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApplicationsProvider, {
  useApplications,
  type Application,
} from "../../app/component/ApplicationsProvider";
import type { Job } from "../../app/component/JobCard";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
  openSignIn: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => {
  // Keep this object stable across renders, like useClerk().
  // Its getters reflect the currently active mocked account.
  const clerk = {
    get session() {
      const state = mocks.useAuth();

      if (!state?.isSignedIn || !state.sessionId) {
        return null;
      }

      return {
        id: state.sessionId,
        getToken: mocks.getToken,
      };
    },

    get user() {
      const state = mocks.useAuth();

      return state?.isSignedIn && state.userId ? { id: state.userId } : null;
    },
  };

  return {
    useAuth: mocks.useAuth,
    useClerk: () => clerk,
    SignInButton: ({ children }: { children: ReactNode }) => (
      <div onClick={mocks.openSignIn}>{children}</div>
    ),
  };
});

const legacyStorageKey = "dev-jobs:pending-application-visits:v1";

const guestStorageKey = "dev-jobs:pending-application-visits:v2:guest";

function accountStorageKey(userId: string) {
  return `dev-jobs:pending-application-visits:v2:user:${encodeURIComponent(userId)}`;
}

const storageKey = accountStorageKey("user-session-a");

const job: Job = {
  id: "job-a",
  source: "Test",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "",
  location: "Remote",
  tags: [],
  url: "https://example.com/jobs/job-a",
  postedAt: "2026-10-11T00:00:00.000Z",
};

const application: Application = {
  id: "application-a",
  jobId: job.id,
  title: job.title,
  company: job.company,
  url: job.url,
  status: "applied",
  notes: "",
  appliedAt: "2026-10-11T01:00:00.000Z",
  updatedAt: "2026-10-11T01:00:00.000Z",
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function auth(signedIn = true, sessionId = "session-a") {
  return {
    isLoaded: true,
    isSignedIn: signedIn,
    userId: signedIn ? `user-${sessionId}` : null,
    sessionId: signedIn ? sessionId : null,
    getToken: mocks.getToken,
  };
}

function Probe() {
  const context = useApplications();

  return (
    <>
      <span data-testid="ready">{String(context.ready)}</span>

      <span data-testid="busy">{String(context.busy)}</span>

      <span data-testid="error">{context.error ?? ""}</span>

      <pre data-testid="records">{JSON.stringify(context.applications)}</pre>

      <button onClick={() => context.recordVisit(job)}>Visit listing</button>

      <button onClick={() => void context.track(job.id)}>Track directly</button>

      <button
        onClick={() =>
          void context.update(job.id, {
            status: "interviewing",
            notes: "Interview on Friday",
          })
        }
      >
        Update application
      </button>

      <button onClick={() => void context.remove(job.id)}>
        Remove application
      </button>

      <button onClick={() => void context.reload()}>Reload applications</button>
    </>
  );
}

function tree() {
  return (
    <ApplicationsProvider>
      <Probe />
    </ApplicationsProvider>
  );
}

function records(): Application[] {
  return JSON.parse(
    screen.getByTestId("records").textContent ?? "[]",
  ) as Application[];
}

async function ready() {
  await waitFor(() => {
    expect(screen.getByTestId("ready")).toHaveTextContent("true");
  });
}

function returnToTab() {
  act(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
}

async function openQuestion() {
  const user = userEvent.setup();

  await ready();

  await user.click(screen.getByRole("button", { name: "Visit listing" }));

  expect(
    screen.queryByRole("heading", {
      name: "Did you apply for this job?",
    }),
  ).not.toBeInTheDocument();

  returnToTab();

  await screen.findByRole("heading", {
    name: "Did you apply for this job?",
  });

  return user;
}

function putCalls() {
  return mocks.fetch.mock.calls.filter((call) => call[1]?.method === "PUT");
}

describe("ApplicationsProvider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();

    vi.stubGlobal("fetch", mocks.fetch);

    vi.stubGlobal("AbortSignal", {
      timeout: vi.fn(() => new AbortController().signal),
    });

    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5000");

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    mocks.useAuth.mockReturnValue(auth());
    mocks.getToken.mockResolvedValue("test-token");
    mocks.fetch.mockResolvedValue(response({ applications: [] }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it("does not fetch applications while signed out", async () => {
    mocks.useAuth.mockReturnValue(auth(false));

    render(tree());
    await ready();

    expect(records()).toEqual([]);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not fetch while Clerk is loading", async () => {
    mocks.useAuth.mockReturnValue({
      ...auth(),
      isLoaded: false,
    });

    render(tree());

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("ready")).toHaveTextContent("false");

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("waits for a complete signed-in identity", async () => {
    mocks.useAuth.mockReturnValue({
      ...auth(),
      userId: null,
    });

    render(tree());

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("ready")).toHaveTextContent("false");

    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("loads applications with the session token", async () => {
    mocks.fetch.mockResolvedValue(response({ applications: [application] }));

    render(tree());
    await ready();

    expect(records()).toEqual([application]);

    const [url, options] = mocks.fetch.mock.calls[0];

    expect(String(url)).toBe("http://localhost:5000/api/applications");

    expect(options).toMatchObject({
      method: "GET",
      headers: {
        Authorization: "Bearer test-token",
      },
      cache: "no-store",
    });

    expect(options).not.toHaveProperty("body");
  });

  it("asks only after returning from a visited listing", async () => {
    render(tree());

    await openQuestion();

    expect(screen.getByText("Frontend Engineer · Example")).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Yes, I applied",
      }),
    ).toBeInTheDocument();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["Not yet", "Dismiss application question"])(
    "closes the question with %s without creating an application",
    async (name) => {
      render(tree());

      const user = await openQuestion();

      await user.click(screen.getByRole("button", { name }));

      expect(
        screen.queryByRole("heading", {
          name: "Did you apply for this job?",
        }),
      ).not.toBeInTheDocument();

      expect(records()).toEqual([]);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    },
  );

  it("adds immediately and replaces the temporary entry after saving", async () => {
    const pending = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ applications: [] }))
      .mockReturnValueOnce(pending.promise);

    render(tree());

    const user = await openQuestion();

    await user.click(
      screen.getByRole("button", {
        name: "Yes, I applied",
      }),
    );

    expect(records()).toMatchObject([
      {
        id: `optimistic:${job.id}`,
        jobId: job.id,
        title: job.title,
        status: "applied",
      },
    ]);

    expect(
      screen.queryByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Application added. Saving in the background."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Track directly",
      }),
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      pending.resolve(response({ application }));
    });

    await waitFor(() => {
      expect(records()).toEqual([application]);
      expect(screen.getByTestId("busy")).toHaveTextContent("false");
    });

    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("rolls back a failed add without removing other applications", async () => {
    const other: Application = {
      ...application,
      id: "application-b",
      jobId: "job-b",
      title: "Backend Engineer",
    };

    const pending = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ applications: [other] }))
      .mockReturnValueOnce(pending.promise);

    render(tree());

    const user = await openQuestion();

    await user.click(
      screen.getByRole("button", {
        name: "Yes, I applied",
      }),
    );

    expect(records()).toHaveLength(2);

    await act(async () => {
      pending.resolve(response({}, 500));
    });

    await waitFor(() => {
      expect(records()).toEqual([other]);
    });

    expect(
      await screen.findByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t confirm that your application was saved.",
    );

    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");

    expect(stored[0].confirmed).toBe(false);

    // Failure must not create an automatic retry loop.
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves a signed-out Yes choice and resumes after sign-in", async () => {
    mocks.useAuth.mockReturnValue(auth(false));

    const { rerender } = render(tree());
    const user = await openQuestion();

    await user.click(
      screen.getByRole("button", {
        name: "Yes, I applied",
      }),
    );

    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();

    const stored = JSON.parse(sessionStorage.getItem(guestStorageKey) ?? "[]");

    expect(stored[0].confirmed).toBe(true);

    mocks.fetch
      .mockResolvedValueOnce(response({ applications: [] }))
      .mockResolvedValueOnce(response({ application }));

    mocks.useAuth.mockReturnValue(auth(true, "session-new"));

    rerender(tree());

    await waitFor(() => {
      expect(records()).toEqual([application]);
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1].method).toBe("PUT");

    expect(sessionStorage.getItem(guestStorageKey)).toBeNull();

    expect(
      sessionStorage.getItem(accountStorageKey("user-session-new")),
    ).toBeNull();
  });

  it("does not automatically track an unconfirmed guest visit after sign-in", async () => {
    mocks.useAuth.mockReturnValue(auth(false));

    const { rerender } = render(tree());

    await openQuestion();

    const stored = JSON.parse(sessionStorage.getItem(guestStorageKey) ?? "[]");

    expect(stored[0].confirmed).toBe(false);

    mocks.useAuth.mockReturnValue(auth(true, "session-new"));

    rerender(tree());
    await ready();

    expect(records()).toEqual([]);
    expect(putCalls()).toHaveLength(0);

    expect(sessionStorage.getItem(guestStorageKey)).toBeNull();
  });

  it("does not ask again for an already tracked job", async () => {
    mocks.fetch.mockResolvedValue(response({ applications: [application] }));

    render(tree());
    await ready();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Visit listing",
      }),
    );

    returnToTab();

    expect(
      screen.queryByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).not.toBeInTheDocument();

    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("updates status and notes using the authenticated endpoint", async () => {
    const updated: Application = {
      ...application,
      status: "interviewing",
      notes: "Interview on Friday",
    };

    mocks.fetch
      .mockResolvedValueOnce(response({ applications: [application] }))
      .mockResolvedValueOnce(response({ application: updated }));

    render(tree());
    await ready();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Update application",
      }),
    );

    await waitFor(() => {
      expect(records()).toEqual([updated]);
    });

    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        status: "interviewing",
        notes: "Interview on Friday",
      }),
    });
  });

  it("removes an application after the backend confirms deletion", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ applications: [application] }))
      .mockResolvedValueOnce(response(null, 204));

    render(tree());
    await ready();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove application",
      }),
    );

    await waitFor(() => {
      expect(records()).toEqual([]);
    });

    expect(mocks.fetch.mock.calls[1][1].method).toBe("DELETE");
  });

  it("retries loading after a failed initial request", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(response({ applications: [application] }));

    render(tree());
    await ready();

    expect(screen.getByTestId("error")).toHaveTextContent(
      "We couldn’t load your applications.",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reload applications",
      }),
    );

    await waitFor(() => {
      expect(records()).toEqual([application]);

      expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    });
  });

  it("ignores an old session's late loading response", async () => {
    const oldRequest = deferred<Response>();

    mocks.fetch
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(response({ applications: [] }));

    const { rerender } = render(tree());

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    mocks.useAuth.mockReturnValue(auth(true, "session-b"));

    rerender(tree());
    await ready();

    await act(async () => {
      oldRequest.resolve(response({ applications: [application] }));
    });

    expect(records()).toEqual([]);
  });

  it("keeps an account's pending visit out of another account", async () => {
    const { rerender } = render(tree());

    await openQuestion();

    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    mocks.useAuth.mockReturnValue(auth(true, "session-b"));

    rerender(tree());
    await ready();

    expect(records()).toEqual([]);

    expect(
      screen.queryByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).not.toBeInTheDocument();

    expect(
      sessionStorage.getItem(accountStorageKey("user-session-b")),
    ).toBeNull();

    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    expect(putCalls()).toHaveLength(0);
  });

  it("does not replay an old account's pending Yes in another account", async () => {
    const pendingSave = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ applications: [] }))
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValueOnce(response({ applications: [] }));

    const { rerender } = render(tree());
    const user = await openQuestion();

    await user.click(
      screen.getByRole("button", {
        name: "Yes, I applied",
      }),
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    const pendingChoice = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "[]",
    );

    expect(pendingChoice[0].confirmed).toBe(true);

    mocks.useAuth.mockReturnValue(auth(true, "session-b"));

    rerender(tree());
    await ready();

    await act(async () => {
      pendingSave.resolve(response({ application }));
    });

    expect(records()).toEqual([]);

    expect(
      screen.queryByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).not.toBeInTheDocument();

    expect(
      sessionStorage.getItem(accountStorageKey("user-session-b")),
    ).toBeNull();

    expect(putCalls()).toHaveLength(1);
  });

  it("does not send a mutation after its session unmounts while obtaining a token", async () => {
    const pendingToken = deferred<string | null>();

    mocks.getToken
      .mockResolvedValueOnce("account-a-token")
      .mockReturnValueOnce(pendingToken.promise)
      .mockResolvedValueOnce("account-b-token");

    const { rerender } = render(tree());
    const user = await openQuestion();

    await user.click(
      screen.getByRole("button", {
        name: "Yes, I applied",
      }),
    );

    await waitFor(() => {
      expect(mocks.getToken).toHaveBeenCalledTimes(2);
    });

    mocks.useAuth.mockReturnValue(auth(true, "session-b"));

    rerender(tree());
    await ready();

    await act(async () => {
      pendingToken.resolve("account-a-token");
    });

    expect(records()).toEqual([]);
    expect(putCalls()).toHaveLength(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    expect(mocks.fetch.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer account-b-token",
    );
  });

  it("does not expose a signed-in account's visit after signing out", async () => {
    const { rerender } = render(tree());

    await openQuestion();

    mocks.useAuth.mockReturnValue(auth(false));

    rerender(tree());
    await ready();

    expect(records()).toEqual([]);

    expect(
      screen.queryByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).not.toBeInTheDocument();

    expect(sessionStorage.getItem(guestStorageKey)).toBeNull();

    expect(sessionStorage.getItem(storageKey)).not.toBeNull();
  });

  it("restores a pending visit when its original account signs back in", async () => {
    const { rerender } = render(tree());

    await openQuestion();

    mocks.useAuth.mockReturnValue(auth(true, "session-b"));

    rerender(tree());
    await ready();

    expect(
      screen.queryByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).not.toBeInTheDocument();

    mocks.useAuth.mockReturnValue(auth());

    rerender(tree());
    await ready();

    expect(
      await screen.findByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).toBeInTheDocument();

    expect(records()).toEqual([]);
    expect(putCalls()).toHaveLength(0);
  });

  it("discards legacy choices whose account owner is unknown", async () => {
    sessionStorage.setItem(
      legacyStorageKey,
      JSON.stringify([
        {
          job: {
            id: job.id,
            title: job.title,
            company: job.company,
            url: job.url,
          },
          confirmed: true,
        },
      ]),
    );

    render(tree());
    await ready();

    expect(records()).toEqual([]);

    expect(sessionStorage.getItem(legacyStorageKey)).toBeNull();

    expect(
      screen.queryByRole("heading", {
        name: "Did you apply for this job?",
      }),
    ).not.toBeInTheDocument();

    expect(putCalls()).toHaveLength(0);
  });

  it("claims a guest Yes only once when accounts change during saving", async () => {
    mocks.useAuth.mockReturnValue(auth(false));

    const { rerender } = render(tree());
    const user = await openQuestion();

    await user.click(
      screen.getByRole("button", {
        name: "Yes, I applied",
      }),
    );

    const pendingSave = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ applications: [] }))
      .mockReturnValueOnce(pendingSave.promise)
      .mockResolvedValueOnce(response({ applications: [] }));

    mocks.useAuth.mockReturnValue(auth());

    rerender(tree());

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    expect(sessionStorage.getItem(guestStorageKey)).toBeNull();

    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    mocks.useAuth.mockReturnValue(auth(true, "session-b"));

    rerender(tree());
    await ready();

    await act(async () => {
      pendingSave.resolve(response({ application }));
    });

    expect(records()).toEqual([]);

    expect(
      sessionStorage.getItem(accountStorageKey("user-session-b")),
    ).toBeNull();

    expect(putCalls()).toHaveLength(1);
  });
});
