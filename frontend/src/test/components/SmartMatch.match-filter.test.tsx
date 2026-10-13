import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmartMatchPage from "../../app/smart-match/page";

const clerkMocks = vi.hoisted(() => ({
  clerk: {
    user: {
      id: "user-match-test",
    },
    session: {
      id: "session-match-test",
      getToken: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: clerkMocks.clerk.user.id,
    sessionId: clerkMocks.clerk.session.id,
  }),
  useClerk: () => clerkMocks.clerk,
}));

vi.mock("../../app/component/SmartMatchUsage", () => ({
  default: () => null,
}));

vi.mock("../../app/component/SmartMatchChat", () => ({
  default: () => null,
}));

vi.mock("../../app/component/PremiumPreview", () => ({
  default: () => <div>Premium preview</div>,
}));

vi.mock("../../app/component/JobCard", () => ({
  default: ({ job }: { job: { title: string } }) => (
    <article>
      <h3>{job.title}</h3>
    </article>
  ),
}));

const fetchMock = vi.fn<typeof fetch>();

const baseJob = {
  source: "Example Source",
  company: "Example",
  companyLogo: null,
  description: "",
  location: "Remote",
  tags: ["React"],
  url: "https://example.com/jobs/frontend",
  postedAt: "2026-10-13T00:00:00Z",
};

const exceptionalMatch = {
  job: {
    ...baseJob,
    id: "exceptional-job",
    title: "Exceptional Frontend Role",
  },
  strength: "strong",
  workMode: "remote",
  matchedSkills: ["React", "TypeScript"],
};

const highMatch = {
  job: {
    ...baseJob,
    id: "high-job",
    title: "High Frontend Role",
  },
  strength: "partial",
  workMode: "remote",
  matchedSkills: ["React"],
};

let responseMatches = [exceptionalMatch, highMatch];

beforeEach(() => {
  responseMatches = [exceptionalMatch, highMatch];
  clerkMocks.clerk.user.id = "user-match-test";
  clerkMocks.clerk.session.id = "session-match-test";

  clerkMocks.clerk.session.getToken.mockReset().mockResolvedValue("test-token");

  fetchMock.mockReset();

  fetchMock.mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);

    let payload: unknown;

    if (url.endsWith("/bootstrap")) {
      payload = {
        access: { premium: true, aiEnabled: true, dailyLimit: 20 },
        profile: {
          skills: ["React", "TypeScript"],
          roles: ["Frontend Engineer"],
          experience: "mid",
          location: "",
          workMode: "remote",
        },
        usage: {
          used: 0,
          limit: 20,
          remaining: 20,
          resetsAt: "2026-10-14T00:00:00Z",
        },
        matches: responseMatches,
        searched: 20,
      };
    } else {
      throw new Error(`Unexpected test request: ${url}`);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SmartMatch exceptional filter", () => {
  it("does not duplicate loading during development Strict Mode effect replay", async () => {
    render(
      <StrictMode>
        <SmartMatchPage />
      </StrictMode>,
    );
    await screen.findByRole("heading", { name: "High Frontend Role" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("opens the premium preview without requesting a profile or matches", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access: { premium: false, aiEnabled: true, dailyLimit: 20 },
          profile: null,
          usage: null,
          matches: [],
          searched: 0,
        }),
      ),
    );
    render(<SmartMatchPage />);
    expect(await screen.findByText("Premium preview")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "High Frontend Role" }),
    ).not.toBeInTheDocument();
  });

  it("opens the profile editor without an unnecessary matches request when no profile is saved", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access: { premium: true, aiEnabled: true, dailyLimit: 20 },
          profile: null,
          usage: null,
          matches: [],
          searched: 0,
        }),
      ),
    );
    render(<SmartMatchPage />);
    expect(
      await screen.findByRole("heading", {
        name: "Review your developer profile",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts old loading and ignores its response after switching accounts", async () => {
    let finishOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => {
      finishOld = resolve;
    });
    fetchMock.mockImplementationOnce(() => oldResponse);
    const rendered = render(<SmartMatchPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const oldSignal = fetchMock.mock.calls[0]![1]!.signal;
    clerkMocks.clerk.user.id = "user-second";
    clerkMocks.clerk.session.id = "session-second";
    rendered.rerender(<SmartMatchPage />);
    await screen.findByRole("heading", { name: "High Frontend Role" });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      finishOld(
        new Response(
          JSON.stringify({
            access: { premium: false, aiEnabled: true, dailyLimit: 20 },
            profile: null,
            usage: null,
            matches: [],
            searched: 0,
          }),
        ),
      );
    });
    expect(screen.queryByText("Premium preview")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "High Frontend Role" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads the workspace with one initial private request", async () => {
    render(<SmartMatchPage />);
    await screen.findByRole("heading", { name: "High Frontend Role" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/bootstrap$/);
  });
  it("shows the renamed filter and short matching note", async () => {
    render(<SmartMatchPage />);

    expect(
      await screen.findByRole("checkbox", {
        name: "Exceptional matches only",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Based on your profile and available listing details."),
    ).toBeInTheDocument();

    expect(screen.queryByText("Strong overlap only")).not.toBeInTheDocument();
  });

  it("shows only strong-tier jobs when checked", async () => {
    render(<SmartMatchPage />);

    await screen.findByRole("heading", {
      name: "High Frontend Role",
    });

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Exceptional matches only",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Exceptional Frontend Role",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "High Frontend Role",
      }),
    ).not.toBeInTheDocument();
  });

  it("restores high matches when unchecked", async () => {
    render(<SmartMatchPage />);

    await screen.findByRole("heading", {
      name: "High Frontend Role",
    });

    const checkbox = screen.getByRole("checkbox", {
      name: "Exceptional matches only",
    });

    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(
      screen.getByRole("heading", {
        name: "High Frontend Role",
      }),
    ).toBeInTheDocument();
  });

  it("lets users clear an empty exceptional filter", async () => {
    responseMatches = [highMatch];

    render(<SmartMatchPage />);

    await screen.findByRole("heading", {
      name: "High Frontend Role",
    });

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Exceptional matches only",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "No exceptional matches yet",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show all matches",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "High Frontend Role",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("checkbox", {
        name: "Exceptional matches only",
      }),
    ).not.toBeChecked();
  });
});
