import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import JobsList from "../../app/component/JobsList";
import type { Job } from "../../app/component/JobCard";

vi.mock("../../app/component/JobCard", () => ({
  default: ({ job }: { job: Job }) => (
    <article>
      <h3>{job.title}</h3>
    </article>
  ),
}));

const scrollIntoViewMock = vi.fn();
const matchMediaMock = vi.fn();

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

function createJobs(count: number): Job[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `job-${index + 1}`,
    source: "Remote OK",
    title: `Developer job ${index + 1}`,
    company: "Example",
    companyLogo: null,
    description: "Build developer tools.",
    location: "Singapore",
    tags: ["react"],
    url: `https://example.com/jobs/${index + 1}`,
    postedAt: "2026-10-08T00:00:00Z",
  }));
}

describe("JobsList", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });
  });

  beforeEach(() => {
    scrollIntoViewMock.mockReset();
    matchMediaMock.mockReset();

    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal("matchMedia", matchMediaMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        originalScrollIntoView,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("shows an empty message when there are no jobs", () => {
    render(<JobsList jobs={[]} />);

    expect(screen.getByText("No jobs found.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Job pagination" }),
    ).not.toBeInTheDocument();
  });

  it.each([1, 3, 18])(
    "shows all %i jobs without pagination when only one page is needed",
    (count) => {
      render(<JobsList jobs={createJobs(count)} />);

      expect(screen.getAllByRole("article")).toHaveLength(count);
      expect(
        screen.queryByRole("navigation", { name: "Job pagination" }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows only the first 18 jobs initially", () => {
    render(<JobsList jobs={createJobs(39)} />);

    expect(screen.getAllByRole("article")).toHaveLength(18);
    expect(screen.getByText("Developer job 1")).toBeInTheDocument();
    expect(screen.getByText("Developer job 18")).toBeInTheDocument();
    expect(screen.queryByText("Developer job 19")).not.toBeInTheDocument();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it.each([
    [19, 2],
    [36, 2],
    [37, 3],
    [54, 3],
  ])("creates %i jobs with %i page buttons", (jobCount, pageCount) => {
    render(<JobsList jobs={createJobs(jobCount)} />);

    expect(screen.getAllByRole("button", { name: /^Page \d+$/ })).toHaveLength(
      pageCount,
    );
  });

  it("marks the first page as current and disables Previous", () => {
    render(<JobsList jobs={createJobs(39)} />);

    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("shows the next 18 jobs when Next is clicked", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getAllByRole("article")).toHaveLength(18);
    expect(screen.getByText("Developer job 19")).toBeInTheDocument();
    expect(screen.getByText("Developer job 36")).toBeInTheDocument();
    expect(screen.queryByText("Developer job 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Developer job 37")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Page 1" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("returns to the previous page", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(screen.getByText("Developer job 1")).toBeInTheDocument();
    expect(screen.queryByText("Developer job 19")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
  });

  it("allows jumping directly to a numbered page", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Developer job 37")).toBeInTheDocument();
    expect(screen.getByText("Developer job 39")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("disables Next on the last page", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));
    scrollIntoViewMock.mockClear();

    const nextButton = screen.getByRole("button", { name: "Next page" });

    expect(nextButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();

    await user.click(nextButton);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Developer job 37")).toBeInTheDocument();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("does not move or scroll before page one", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(screen.getByText("Developer job 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("shows 18 jobs on a full final page", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(36)} />);

    await user.click(screen.getByRole("button", { name: "Page 2" }));

    expect(screen.getAllByRole("article")).toHaveLength(18);
    expect(screen.getByText("Developer job 36")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("clamps the current page when fewer jobs are supplied", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    rerender(<JobsList jobs={createJobs(19)} />);

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Developer job 19")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("removes pagination when updated results fit on one page", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    rerender(<JobsList jobs={createJobs(3)} />);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Developer job 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Job pagination" }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when updated results contain no jobs", () => {
    const { rerender } = render(<JobsList jobs={createJobs(39)} />);

    rerender(<JobsList jobs={[]} />);

    expect(screen.getByText("No jobs found.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it.each(["Next page", "Page 2"])(
    "scrolls to the job list when %s is clicked",
    async (buttonName) => {
      const user = userEvent.setup();
      const { container } = render(<JobsList jobs={createJobs(39)} />);
      const jobsStart = container.firstElementChild;

      await user.click(screen.getByRole("button", { name: buttonName }));

      expect(matchMediaMock).toHaveBeenCalledWith(
        "(prefers-reduced-motion: reduce)",
      );
      expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
      expect(scrollIntoViewMock.mock.contexts[0]).toBe(jobsStart);
    },
  );

  it("scrolls to the job list when Previous is clicked", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Page 2" }));
    scrollIntoViewMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("scrolls instantly when reduced motion is preferred", async () => {
    const user = userEvent.setup();

    matchMediaMock.mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    render(<JobsList jobs={createJobs(39)} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "instant",
      block: "start",
    });
  });

  it("does not scroll automatically when jobs are updated", () => {
    const { rerender } = render(<JobsList jobs={createJobs(39)} />);

    rerender(<JobsList jobs={createJobs(19)} />);

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
