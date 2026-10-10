import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedJobsPage from "../../app/saved-jobs/page";
import type { SavedJob } from "../../app/component/SavedJobsProvider";

const mocks = vi.hoisted(() => ({
  useSavedJobs: vi.fn(),
  reload: vi.fn(),
  signInOptions: vi.fn(),
}));

vi.mock("../../app/component/SavedJobsProvider", () => ({
  useSavedJobs: mocks.useSavedJobs,
}));

vi.mock("../../app/component/JobCard", () => ({
  default: ({ job }: { job: SavedJob }) => (
    <article aria-label={job.title}>{job.title}</article>
  ),
}));

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({
    children,
    ...options
  }: {
    children: ReactNode;
    mode?: string;
    forceRedirectUrl?: string;
  }) => {
    mocks.signInOptions(options);
    return <div>{children}</div>;
  },
}));

const savedJob: SavedJob = {
  id: "job-a",
  source: "Test",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "",
  location: "Remote",
  tags: [],
  url: "https://example.com/job-a",
  postedAt: "2026-10-11T00:00:00.000Z",
  savedAt: "2026-10-11T01:00:00.000Z",
  isActive: true,
};

function context() {
  return {
    signedIn: true,
    ready: true,
    savedJobs: [],
    error: null,
    reload: mocks.reload,
  };
}

describe("SavedJobsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reload.mockResolvedValue(undefined);
    mocks.useSavedJobs.mockReturnValue(context());
  });

  it("shows skeletons with only a hidden loading label", () => {
    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      ready: false,
    });

    const { container } = render(<SavedJobsPage />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");

    expect(screen.getByText("Loading saved jobs…")).toHaveClass("sr-only");

    const grid = container.querySelector('[aria-hidden="true"] .grid');

    expect(grid?.children).toHaveLength(6);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("shows the signed-out panel and configures sign-in", () => {
    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      signedIn: false,
    });

    render(<SavedJobsPage />);

    expect(
      screen.getByRole("heading", {
        name: "Your shortlist starts here",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Sign in to save jobs",
      }),
    ).toBeInTheDocument();

    expect(mocks.signInOptions).toHaveBeenCalledWith({
      mode: "modal",
      forceRedirectUrl: "/saved-jobs",
    });
  });

  it("centers the empty panel without duplicate headings", () => {
    render(<SavedJobsPage />);

    expect(
      screen.getByRole("heading", { name: "No saved jobs yet" }),
    ).toBeInTheDocument();

    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveClass("text-center");

    expect(
      screen.getByText("Keep opportunities you want to revisit."),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Explore jobs" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows a left-aligned count pill and saved cards", () => {
    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      savedJobs: [
        savedJob,
        {
          ...savedJob,
          id: "job-b",
          title: "Backend Engineer",
        },
      ],
    });

    render(<SavedJobsPage />);

    const count = screen.getByRole("status");

    expect(count).toHaveTextContent(/2\s*saved jobs/);
    expect(count).toHaveClass("rounded-full", "bg-surface");
    expect(count.parentElement).toHaveClass("justify-start");
    expect(count).toHaveAttribute("aria-live", "polite");

    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("uses singular wording for one saved job", () => {
    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      savedJobs: [savedJob],
    });

    render(<SavedJobsPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/1\s*saved job$/);
  });

  it("warns about inactive listings without hiding them", () => {
    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      savedJobs: [{ ...savedJob, isActive: false }],
    });

    render(<SavedJobsPage />);

    expect(
      screen.getByText("This listing may no longer be available."),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("article", { name: savedJob.title }),
    ).toBeInTheDocument();
  });

  it("retries loading after an error", async () => {
    const user = userEvent.setup();

    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      ready: false,
      error: "Couldn’t load saved jobs. Please try again.",
    });

    render(<SavedJobsPage />);

    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});
