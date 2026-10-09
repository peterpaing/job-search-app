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

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/",
  query: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

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

function createJobs(count: number, start = 1): Job[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `job-${start + index}`,
    source: "Remote OK",
    title: `Developer job ${start + index}`,
    company: "Example",
    companyLogo: null,
    description: "",
    location: "Singapore",
    tags: ["react"],
    url: `https://example.com/jobs/${start + index}`,
    postedAt: "2026-10-08T00:00:00Z",
  }));
}

function visiblePageNumbers() {
  return screen
    .getAllByRole("button", { name: /^Page \d+$/ })
    .map((button) => button.textContent);
}

function lastDestination() {
  const calls = navigation.push.mock.calls;

  return new URL(calls[calls.length - 1][0], "http://localhost");
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
    navigation.push.mockReset();
    navigation.pathname = "/";
    navigation.query = "";
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

  it("shows the styled empty state without pagination", () => {
    render(<JobsList jobs={[]} page={1} totalPages={0} />);

    expect(screen.getByRole("status")).toHaveTextContent("No jobs found.");
    expect(
      screen.getByRole("heading", { name: "No jobs found." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Try a different keyword, broaden your location, or remove some filters.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it.each([1, 3, 18])(
    "renders all %i server-provided jobs without pagination for one page",
    (count) => {
      render(<JobsList jobs={createJobs(count)} page={1} totalPages={1} />);

      expect(screen.getAllByRole("article")).toHaveLength(count);
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    },
  );

  it("renders page-two jobs without slicing them again", () => {
    render(<JobsList jobs={createJobs(18, 19)} page={2} totalPages={3} />);

    expect(screen.getAllByRole("article")).toHaveLength(18);
    expect(screen.getByText("Developer job 19")).toBeInTheDocument();
    expect(screen.getByText("Developer job 36")).toBeInTheDocument();
    expect(screen.queryByText("Developer job 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders a partial final page", () => {
    render(<JobsList jobs={createJobs(3, 37)} page={3} totalPages={3} />);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Developer job 39")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it.each([
    [2, ["1", "2"]],
    [3, ["1", "2", "3"]],
    [4, ["1", "2", "3", "4"]],
    [10, ["1", "2", "3", "4"]],
  ])("shows the expected buttons for %i pages", (totalPages, expected) => {
    render(<JobsList jobs={createJobs(18)} page={1} totalPages={totalPages} />);

    expect(visiblePageNumbers()).toEqual(expected);
  });

  it.each([
    [3, 10, ["1", "2", "3", "4"]],
    [4, 10, ["2", "3", "4", "5"]],
    [5, 10, ["3", "4", "5", "6"]],
    [6, 7, ["4", "5", "6", "7"]],
    [7, 7, ["4", "5", "6", "7"]],
  ])(
    "positions the four-button window for page %i of %i",
    (page, totalPages, expected) => {
      render(
        <JobsList jobs={createJobs(18)} page={page} totalPages={totalPages} />,
      );

      expect(visiblePageNumbers()).toEqual(expected);
      expect(
        screen.getByRole("button", { name: `Page ${page}` }),
      ).toHaveAttribute("aria-current", "page");
    },
  );

  it.each(["Next page", "Page 2"])(
    "updates the URL when %s is clicked",
    async (buttonName) => {
      const user = userEvent.setup();

      render(<JobsList jobs={createJobs(18)} page={1} totalPages={3} />);

      await user.click(screen.getByRole("button", { name: buttonName }));

      expect(navigation.push).toHaveBeenCalledWith("/?page=2", {
        scroll: false,
      });
    },
  );

  it("preserves search and repeated source filters", async () => {
    const user = userEvent.setup();
    navigation.query =
      "q=C%2B%2B&location=Singapore&source=Himalayas&source=Remote+OK&company=Acme&postedWithin=7&page=2";

    render(<JobsList jobs={createJobs(18, 19)} page={2} totalPages={4} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));

    const params = lastDestination().searchParams;

    expect(params.get("q")).toBe("C++");
    expect(params.get("location")).toBe("Singapore");
    expect(params.getAll("source")).toEqual(["Himalayas", "Remote OK"]);
    expect(params.get("company")).toBe("Acme");
    expect(params.get("postedWithin")).toBe("7");
    expect(params.getAll("page")).toEqual(["3"]);
  });

  it("removes page from the URL when returning to page one", async () => {
    const user = userEvent.setup();
    navigation.query = "q=react&page=2";

    render(<JobsList jobs={createJobs(18, 19)} page={2} totalPages={3} />);

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(navigation.push).toHaveBeenCalledWith("/?q=react", {
      scroll: false,
    });
  });

  it("uses the current pathname", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/jobs";

    render(<JobsList jobs={createJobs(18)} page={1} totalPages={3} />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    expect(navigation.push).toHaveBeenCalledWith("/jobs?page=3", {
      scroll: false,
    });
  });

  it("does not navigate or scroll when the current page is clicked", async () => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(18)} page={1} totalPages={3} />);

    await user.click(screen.getByRole("button", { name: "Page 1" }));

    expect(navigation.push).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it.each([
    [1, "Previous page"],
    [3, "Next page"],
  ])("disables %s at the page boundary", async (page, buttonName) => {
    const user = userEvent.setup();

    render(<JobsList jobs={createJobs(18)} page={page} totalPages={3} />);

    const button = screen.getByRole("button", { name: buttonName });

    expect(button).toBeDisabled();

    await user.click(button);

    expect(navigation.push).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("scrolls to the results when navigating", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <JobsList jobs={createJobs(18)} page={1} totalPages={3} />,
    );

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(matchMediaMock).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(scrollIntoViewMock.mock.contexts[0]).toBe(
      container.firstElementChild,
    );
  });

  it("uses instant scrolling for reduced motion", async () => {
    const user = userEvent.setup();
    matchMediaMock.mockReturnValue({ matches: true });

    render(<JobsList jobs={createJobs(18)} page={1} totalPages={3} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "instant",
      block: "start",
    });
  });

  it("updates jobs and page buttons from new server props", () => {
    const { rerender } = render(
      <JobsList jobs={createJobs(18, 55)} page={4} totalPages={10} />,
    );

    rerender(<JobsList jobs={createJobs(3, 37)} page={3} totalPages={3} />);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Developer job 37")).toBeInTheDocument();
    expect(visiblePageNumbers()).toEqual(["1", "2", "3"]);
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("removes pagination when updated results fit on one page", () => {
    const { rerender } = render(
      <JobsList jobs={createJobs(18)} page={1} totalPages={3} />,
    );

    rerender(<JobsList jobs={createJobs(3)} page={1} totalPages={1} />);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows the empty state when updated results are empty", () => {
    const { rerender } = render(
      <JobsList jobs={createJobs(18)} page={1} totalPages={3} />,
    );

    rerender(<JobsList jobs={[]} page={1} totalPages={0} />);

    expect(screen.getByText("No jobs found.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
