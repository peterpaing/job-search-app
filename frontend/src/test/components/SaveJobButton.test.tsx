import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SaveJobButton from "../../app/component/SaveJobButton";
import type { Job } from "../../app/component/JobCard";

const mocks = vi.hoisted(() => ({
  useSavedJobs: vi.fn(),
  setSaved: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("../../app/component/SavedJobsProvider", () => ({
  useSavedJobs: mocks.useSavedJobs,
}));

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: ReactNode }) => (
    <div onClick={mocks.signIn}>{children}</div>
  ),
}));

const job: Job = {
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
};

function context() {
  return {
    signedIn: true,
    ready: true,
    savedJobs: [],
    pendingJobIds: [],
    error: null,
    setSaved: mocks.setSaved,
  };
}

describe("SaveJobButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.setSaved.mockResolvedValue(undefined);
    mocks.useSavedJobs.mockReturnValue(context());
  });

  it("asks signed-out users to sign in", async () => {
    const user = userEvent.setup();

    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      signedIn: false,
    });

    render(<SaveJobButton job={job} />);

    await user.click(
      screen.getByRole("button", {
        name: "Sign in to save Frontend Engineer",
      }),
    );

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.setSaved).not.toHaveBeenCalled();
  });

  it("sends the job and desired saved state", async () => {
    const user = userEvent.setup();

    render(<SaveJobButton job={job} />);

    await user.click(
      screen.getByRole("button", {
        name: "Save Frontend Engineer",
      }),
    );

    expect(mocks.setSaved).toHaveBeenCalledWith(job, true);
  });

  it("shows Saved and requests unsaving for an existing save", async () => {
    const user = userEvent.setup();

    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      savedJobs: [job],
    });

    render(<SaveJobButton job={job} />);

    const button = screen.getByRole("button", {
      name: "Unsave Frontend Engineer",
    });

    expect(button).toHaveTextContent("Saved");
    expect(button).toHaveAttribute("aria-pressed", "true");

    await user.click(button);

    expect(mocks.setSaved).toHaveBeenCalledWith(job, false);
  });

  it("disables a pending job without showing Updating text", async () => {
    const user = userEvent.setup();

    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      savedJobs: [job],
      pendingJobIds: [job.id],
    });

    render(<SaveJobButton job={job} />);

    const button = screen.getByRole("button", {
      name: "Unsave Frontend Engineer",
    });

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Saved");
    expect(screen.queryByText(/Updating/)).not.toBeInTheDocument();

    await user.click(button);

    expect(mocks.setSaved).not.toHaveBeenCalled();
  });

  it("disables saving before saved jobs are loaded", () => {
    mocks.useSavedJobs.mockReturnValue({
      ...context(),
      ready: false,
    });

    render(<SaveJobButton job={job} />);

    expect(
      screen.getByRole("button", {
        name: "Save Frontend Engineer",
      }),
    ).toBeDisabled();
  });
});
