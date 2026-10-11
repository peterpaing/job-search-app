import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import TrackerPage from "../../app/tracker/page";
import type {
  Application,
  ApplicationStatus,
} from "../../app/component/ApplicationsProvider";

const mocks = vi.hoisted(() => ({
  useApplications: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../app/component/ApplicationsProvider", () => ({
  useApplications: mocks.useApplications,
}));

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const application: Application = {
  id: "application-a",
  jobId: "job-a",
  title: "Frontend Engineer",
  company: "Example",
  url: "https://example.com/jobs/job-a",
  status: "applied",
  notes: "",
  appliedAt: "2026-10-11T01:00:00.000Z",
  updatedAt: "2026-10-11T01:00:00.000Z",
};

function context() {
  return {
    signedIn: true,
    ready: true,
    applications: [application],
    busy: false,
    error: null,
    update: mocks.update,
    remove: mocks.remove,
    reload: mocks.reload,
  };
}

const dialogPrototype = HTMLDialogElement.prototype;

const originalShowModal = Object.getOwnPropertyDescriptor(
  dialogPrototype,
  "showModal",
);

const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, "close");

beforeAll(() => {
  // Emulate dialogs in jsdom. Browser tests cover native dialog behavior.
  Object.defineProperty(dialogPrototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });

  Object.defineProperty(dialogPrototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

afterAll(() => {
  if (originalShowModal) {
    Object.defineProperty(dialogPrototype, "showModal", originalShowModal);
  } else {
    Reflect.deleteProperty(dialogPrototype, "showModal");
  }

  if (originalClose) {
    Object.defineProperty(dialogPrototype, "close", originalClose);
  } else {
    Reflect.deleteProperty(dialogPrototype, "close");
  }
});

describe("TrackerPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.useApplications.mockReturnValue(context());
    mocks.update.mockResolvedValue(true);
    mocks.remove.mockResolvedValue(true);
    mocks.reload.mockResolvedValue(undefined);
  });

  it("shows skeletons while applications load", () => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      ready: false,
    });

    const { container } = render(<TrackerPage />);

    expect(
      screen.getByRole("status", {
        name: "Loading applications",
      }),
    ).toHaveAttribute("aria-busy", "true");

    expect(
      container.querySelector('[aria-hidden="true"] .grid')?.children,
    ).toHaveLength(6);

    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("shows sign-in controls while signed out", () => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      signedIn: false,
      applications: [],
    });

    render(<TrackerPage />);

    expect(
      screen.getByRole("heading", {
        name: "Your applications, in one place",
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the centered empty state", () => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      applications: [],
    });

    render(<TrackerPage />);

    const heading = screen.getByRole("heading", {
      name: "No applications yet",
    });

    expect(heading.parentElement).toHaveClass("text-center", "min-h-[340px]");

    expect(screen.getByRole("link", { name: "Explore jobs" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("renders the application and original listing", () => {
    render(<TrackerPage />);

    const heading = screen.getByRole("heading", {
      name: application.title,
    });

    expect(heading).toBeInTheDocument();

    const card = heading.closest("article");

    if (!card) {
      throw new Error("Expected the application heading inside a card.");
    }

    const cardQueries = within(card);

    expect(
      cardQueries.getByText(application.company, {
        selector: "p.mt-5",
      }),
    ).toBeInTheDocument();

    const originalLink = cardQueries.getByRole("link", {
      name: /original listing/i,
    });

    expect(originalLink).toHaveAttribute("href", application.url);
    expect(originalLink).toHaveAttribute("target", "_blank");
    expect(originalLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("status")).toHaveTextContent(/1\s*application$/);
  });

  it.each([
    ["applied", "Applied", "bg-blue-50"],
    ["interviewing", "Interviewing", "bg-amber-50"],
    ["offered", "Offered", "bg-emerald-50"],
    ["rejected", "Rejected", "bg-rose-50"],
  ] as const)("uses the correct badge for %s", (status, label, colorClass) => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      applications: [
        {
          ...application,
          status: status as ApplicationStatus,
        },
      ],
    });

    render(<TrackerPage />);

    const badge = screen.getByText(label, {
      selector: "span",
    });

    expect(badge).toHaveClass(colorClass);

    expect(
      screen.getByRole("combobox", {
        name: "Application status",
      }),
    ).toHaveValue(status);
  });

  it("keeps notes fixed-height and non-resizable", () => {
    render(<TrackerPage />);

    const notes = screen.getByRole("textbox", {
      name: "Personal notes",
    });

    expect(notes).toHaveClass(
      "application-notes",
      "h-36",
      "resize-none",
      "overflow-y-auto",
    );

    expect(notes).toHaveAttribute("maxlength", "5000");
  });

  it("keeps Save changes disabled until something changes", () => {
    render(<TrackerPage />);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("submits the selected status and notes", async () => {
    const user = userEvent.setup();

    render(<TrackerPage />);

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Application status",
      }),
      "interviewing",
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Personal notes",
      }),
      "Interview on Friday",
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.update).toHaveBeenCalledWith("job-a", {
      status: "interviewing",
      notes: "Interview on Friday",
    });
  });

  it("preserves typed notes after a failed save", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue(false);

    render(<TrackerPage />);

    const notes = screen.getByRole("textbox", {
      name: "Personal notes",
    });

    await user.type(notes, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledTimes(1);

      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled();
    });

    expect(notes).toHaveValue("Keep this draft");
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("opens a confirmation dialog without deleting immediately", async () => {
    const user = userEvent.setup();

    render(<TrackerPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Remove Frontend Engineer at Example from tracker",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Remove application?",
    });

    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("Your saved job stays unchanged.");
    expect(mocks.remove).not.toHaveBeenCalled();

    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
  });

  it("cancels deletion without calling the backend action", async () => {
    const user = userEvent.setup();

    render(<TrackerPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Remove Frontend Engineer at Example from tracker",
      }),
    );

    const dialog = screen.getByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(dialog).not.toHaveAttribute("open");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation", async () => {
    const user = userEvent.setup();

    render(<TrackerPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Remove Frontend Engineer at Example from tracker",
      }),
    );

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove",
      }),
    );

    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith("job-a");
    });
  });

  it("keeps the dialog open and shows an error after failed deletion", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue(false);

    render(<TrackerPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Remove Frontend Engineer at Example from tracker",
      }),
    );

    const dialog = screen.getByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "We couldn’t confirm removal.",
    );

    expect(dialog).toHaveAttribute("open");
  });

  it("disables mutation controls while a request is pending", () => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      busy: true,
    });

    render(<TrackerPage />);

    expect(
      screen.getByRole("combobox", {
        name: "Application status",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("textbox", {
        name: "Personal notes",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Remove Frontend Engineer at Example from tracker",
      }),
    ).toBeDisabled();
  });

  it("allows refreshing after a loading error", () => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      error: "Unable to load applications.",
    });

    render(<TrackerPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load applications.",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh applications",
      }),
    );

    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("adds extra bottom space for the loaded signed-in empty state", () => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      applications: [],
    });

    const { container } = render(<TrackerPage />);
    const section = container.firstElementChild;

    expect(section?.tagName).toBe("SECTION");
    expect(section).toHaveClass(
      "min-h-[85svh]",
      "pb-32",
      "sm:pb-40",
      "lg:pb-48",
    );

    for (const className of ["min-h-[65svh]", "pb-24", "sm:pb-32"]) {
      expect(section).not.toHaveClass(className);
    }
  });

  it.each([
    {
      name: "populated",
      signedIn: true,
      ready: true,
      applications: [application],
      error: null,
    },
    {
      name: "loading",
      signedIn: true,
      ready: false,
      applications: [],
      error: null,
    },
    {
      name: "signed out",
      signedIn: false,
      ready: true,
      applications: [],
      error: null,
    },
    {
      name: "error",
      signedIn: true,
      ready: true,
      applications: [],
      error: "Unable to load applications.",
    },
  ])("keeps normal spacing when $name", (state) => {
    mocks.useApplications.mockReturnValue({
      ...context(),
      signedIn: state.signedIn,
      ready: state.ready,
      applications: state.applications,
      error: state.error,
    });

    const { container } = render(<TrackerPage />);
    const section = container.firstElementChild;

    expect(section).toHaveClass("min-h-[65svh]", "pb-24", "sm:pb-32");

    for (const className of [
      "min-h-[85svh]",
      "pb-32",
      "sm:pb-40",
      "lg:pb-48",
    ]) {
      expect(section).not.toHaveClass(className);
    }
  });
});
