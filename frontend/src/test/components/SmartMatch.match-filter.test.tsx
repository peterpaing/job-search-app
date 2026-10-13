import { fireEvent, render, screen } from "@testing-library/react";
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
    userId: "user-match-test",
    sessionId: "session-match-test",
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

  clerkMocks.clerk.session.getToken.mockReset().mockResolvedValue("test-token");

  fetchMock.mockReset();

  fetchMock.mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);

    let payload: unknown;

    if (url.endsWith("/access")) {
      payload = {
        premium: true,
        aiEnabled: true,
        dailyLimit: 20,
      };
    } else if (url.endsWith("/profile")) {
      payload = {
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
      };
    } else if (url.endsWith("/matches")) {
      payload = {
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
