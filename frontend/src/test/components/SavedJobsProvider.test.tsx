import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SavedJobsProvider, {
  SavedJobsNotice,
  useSavedJobs,
  type SavedJob,
} from "../../app/component/SavedJobsProvider";
import type { Job } from "../../app/component/JobCard";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: mocks.useAuth,
}));

const jobA: Job = {
  id: "job-a",
  source: "Test",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "",
  location: "Remote",
  tags: ["react"],
  url: "https://example.com/job-a",
  postedAt: "2026-10-11T00:00:00.000Z",
};

const jobB: Job = {
  ...jobA,
  id: "job-b",
  title: "Backend Engineer",
};

const savedA: SavedJob = {
  ...jobA,
  savedAt: "2026-10-11T01:00:00.000Z",
  isActive: true,
};

const savedB: SavedJob = {
  ...jobB,
  savedAt: "2026-10-11T02:00:00.000Z",
  isActive: true,
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

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function auth(sessionId = "session-a") {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: `user-${sessionId}`,
    sessionId,
    getToken: mocks.getToken,
  };
}

function Probe() {
  const { ready, savedJobs, pendingJobIds, error, reload, setSaved } =
    useSavedJobs();

  return (
    <div>
      <output data-testid="ready">{String(ready)}</output>
      <output data-testid="pending">{pendingJobIds.join(",")}</output>
      <output data-testid="saved-data">{JSON.stringify(savedJobs)}</output>

      <ul>
        {savedJobs.map((job) => (
          <li key={job.id} data-testid={`saved-${job.id}`}>
            {job.title}
          </li>
        ))}
      </ul>

      {error && <p role="alert">{error}</p>}

      <button onClick={() => void setSaved(jobA, true)}>Save A</button>
      <button onClick={() => void setSaved(jobA, false)}>Unsave A</button>
      <button onClick={() => void setSaved(jobB, true)}>Save B</button>
      <button onClick={() => void reload()}>Reload</button>
    </div>
  );
}

function tree() {
  return (
    <SavedJobsProvider>
      <Probe />
      <SavedJobsNotice />
    </SavedJobsProvider>
  );
}

async function waitUntilReady() {
  await waitFor(() => {
    expect(screen.getByTestId("ready")).toHaveTextContent("true");
  });
}

describe("SavedJobsProvider", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubGlobal("AbortSignal", {
      timeout: vi.fn(() => new AbortController().signal),
    });

    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5000");

    mocks.useAuth.mockReturnValue(auth());
    mocks.getToken.mockResolvedValue("test-token");
    mocks.fetch.mockResolvedValue(response({ jobs: [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not request saved jobs while signed out", () => {
    mocks.useAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      getToken: mocks.getToken,
    });

    render(tree());

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("loads saved jobs with the session token", async () => {
    mocks.fetch.mockResolvedValue(response({ jobs: [savedA] }));

    render(tree());
    await waitUntilReady();

    expect(screen.getByTestId("saved-job-a")).toBeInTheDocument();

    const [url, options] = mocks.fetch.mock.calls[0];

    expect(String(url)).toBe("http://localhost:5000/api/saved-jobs");

    expect(options).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer test-token",
        },
        cache: "no-store",
      }),
    );
  });

  it("shows a load error and recovers after retry", async () => {
    const user = userEvent.setup();

    mocks.fetch
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(response({ jobs: [savedA] }));

    render(tree());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t load saved jobs",
    );

    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitUntilReady();

    expect(screen.getByTestId("saved-job-a")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adds a saved job before the request finishes", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ jobs: [] }))
      .mockReturnValueOnce(pending.promise);

    render(tree());
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: "Save A" }));

    expect(screen.getByTestId("saved-job-a")).toBeInTheDocument();
    expect(screen.getByTestId("pending")).toHaveTextContent("job-a");

    await act(async () => {
      pending.resolve(response({ savedJob: savedA }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("pending")).toBeEmptyDOMElement();
    });

    expect(screen.getByTestId("saved-data")).toHaveTextContent(savedA.savedAt);
  });

  it("removes a saved job before the request finishes", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ jobs: [savedA] }))
      .mockReturnValueOnce(pending.promise);

    render(tree());
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: "Unsave A" }));

    expect(screen.queryByTestId("saved-job-a")).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve(response(null, 204));
    });

    await waitFor(() => {
      expect(screen.getByTestId("pending")).toBeEmptyDOMElement();
    });
  });

  it("rolls back a failed save and shows a global notice", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ jobs: [] }))
      .mockReturnValueOnce(pending.promise);

    render(tree());
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: "Save A" }));

    expect(screen.getByTestId("saved-job-a")).toBeInTheDocument();

    await act(async () => {
      pending.resolve(response({}, 500));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("saved-job-a")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The previous view was restored",
    );
  });

  it("restores a job after a failed unsave", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ jobs: [savedA] }))
      .mockReturnValueOnce(pending.promise);

    render(tree());
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: "Unsave A" }));

    expect(screen.queryByTestId("saved-job-a")).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve(response({}, 500));
    });

    expect(await screen.findByTestId("saved-job-a")).toBeInTheDocument();
  });

  it("ignores duplicate actions on a pending job", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ jobs: [] }))
      .mockReturnValueOnce(pending.promise);

    render(tree());
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: "Save A" }));
    await user.click(screen.getByRole("button", { name: "Save A" }));

    // One initial GET and one PUT.
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.resolve(response({ savedJob: savedA }));
    });
  });

  it("preserves another successful save during rollback", async () => {
    const user = userEvent.setup();
    const pendingA = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ jobs: [] }))
      .mockReturnValueOnce(pendingA.promise)
      .mockResolvedValueOnce(response({ savedJob: savedB }));

    render(tree());
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: "Save A" }));
    await user.click(screen.getByRole("button", { name: "Save B" }));

    await waitFor(() => {
      expect(screen.getByTestId("saved-data")).toHaveTextContent(
        savedB.savedAt,
      );
    });

    await act(async () => {
      pendingA.resolve(response({}, 500));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("saved-job-a")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("saved-job-b")).toBeInTheDocument();
  });

  it("does not apply an old session's response to a new session", async () => {
    const user = userEvent.setup();
    const oldSave = deferred<Response>();

    mocks.fetch
      .mockResolvedValueOnce(response({ jobs: [] }))
      .mockReturnValueOnce(oldSave.promise)
      .mockResolvedValueOnce(response({ jobs: [] }));

    const view = render(tree());
    await waitUntilReady();

    await user.click(screen.getByRole("button", { name: "Save A" }));

    mocks.useAuth.mockReturnValue(auth("session-b"));
    view.rerender(tree());

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("ready")).toHaveTextContent("true");
    });

    await act(async () => {
      oldSave.resolve(response({ savedJob: savedA }));
    });

    expect(screen.queryByTestId("saved-job-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("pending")).toBeEmptyDOMElement();
  });
});
