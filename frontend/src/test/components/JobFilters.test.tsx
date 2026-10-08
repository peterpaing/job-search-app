import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobFilters from "../../app/component/JobFilters";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/",
  query: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigation.push,
  }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

const sources = [
  "Remote OK",
  "We Work Remotely",
  "Himalayas",
  "Dev Global Jobs",
];

function lastNavigation() {
  const calls = navigation.push.mock.calls;
  const destination = calls[calls.length - 1]?.[0];

  expect(typeof destination).toBe("string");

  return new URL(destination, "http://localhost:3000");
}

describe("JobFilters", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.pathname = "/";
    navigation.query = "";
  });

  it("renders the filter controls with empty defaults", () => {
    render(<JobFilters />);

    expect(
      screen.getByRole("heading", { name: "Filters" }),
    ).toBeInTheDocument();

    for (const source of sources) {
      expect(screen.getByRole("checkbox", { name: source })).not.toBeChecked();
    }

    expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Date posted" })).toHaveValue(
      "",
    );

    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();

    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not render the removed filter controls", () => {
    render(<JobFilters />);

    for (const label of [
      "Employment type",
      "Experience level",
      "Salary disclosed only",
      "Country",
      "Location",
      "Sort by",
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("allows selecting and deselecting sources", async () => {
    const user = userEvent.setup();

    render(<JobFilters />);

    const checkbox = screen.getByRole("checkbox", {
      name: "Himalayas",
    });

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([
    ["Past 24 hours", "1"],
    ["Past 7 days", "7"],
    ["Past 30 days", "30"],
  ])("allows selecting %s", async (label, value) => {
    const user = userEvent.setup();

    render(<JobFilters />);

    const select = screen.getByRole("combobox", {
      name: "Date posted",
    });

    await user.selectOptions(select, label);

    expect(select).toHaveValue(value);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not navigate while the user edits filters", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "Example",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Date posted" }),
      "7",
    );

    expect(navigation.push).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("adds selected filters to the URL when Apply is clicked", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "  Example & Company  ",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Date posted" }),
      "7",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(navigation.push).toHaveBeenCalledTimes(1);

    const url = lastNavigation();

    expect(url.pathname).toBe("/");
    expect(url.searchParams.getAll("source")).toEqual([
      "Himalayas",
      "Remote OK",
    ]);
    expect(url.searchParams.get("company")).toBe("Example & Company");
    expect(url.searchParams.get("postedWithin")).toBe("7");

    expect(navigation.push).toHaveBeenCalledWith(expect.any(String), {
      scroll: false,
    });

    expect(onApply).toHaveBeenCalledWith({
      sources: ["Himalayas", "Remote OK"],
      company: "Example & Company",
      postedWithin: "7",
    });

    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("omits empty filters from the URL", async () => {
    const user = userEvent.setup();

    render(<JobFilters />);

    await user.type(screen.getByRole("textbox", { name: "Company" }), "   ");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(navigation.push).toHaveBeenCalledWith("/", {
      scroll: false,
    });
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("restores selected filters from a shared URL", () => {
    navigation.query =
      "source=Himalayas&source=Remote+OK&company=Example&postedWithin=7";

    render(<JobFilters />);

    expect(screen.getByRole("checkbox", { name: "Himalayas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Remote OK" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "We Work Remotely" }),
    ).not.toBeChecked();

    expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue(
      "Example",
    );
    expect(screen.getByRole("combobox", { name: "Date posted" })).toHaveValue(
      "7",
    );
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();

    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("ignores unknown sources and unsupported date values in the controls", () => {
    navigation.query = "source=Unknown&postedWithin=999";

    render(<JobFilters />);

    for (const source of sources) {
      expect(screen.getByRole("checkbox", { name: source })).not.toBeChecked();
    }

    expect(screen.getByRole("combobox", { name: "Date posted" })).toHaveValue(
      "",
    );
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("deduplicates sources restored from the URL", async () => {
    const user = userEvent.setup();

    navigation.query = "source=Himalayas&source=Himalayas";

    render(<JobFilters />);

    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "Example",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(lastNavigation().searchParams.getAll("source")).toEqual([
      "Himalayas",
    ]);
  });

  it("clears filter controls and removes filters from the URL", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    navigation.query = "source=Himalayas&company=Example&postedWithin=7&page=3";

    render(<JobFilters onClear={onClear} />);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(navigation.push).toHaveBeenCalledWith("/", {
      scroll: false,
    });
    expect(onClear).toHaveBeenCalledTimes(1);

    for (const source of sources) {
      expect(screen.getByRole("checkbox", { name: source })).not.toBeChecked();
    }

    expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Date posted" })).toHaveValue(
      "",
    );
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("preserves other query parameters when applying filters", async () => {
    const user = userEvent.setup();

    navigation.query = "q=frontend&location=Singapore&page=3";

    render(<JobFilters />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    const params = lastNavigation().searchParams;

    expect(params.get("q")).toBe("frontend");
    expect(params.get("location")).toBe("Singapore");
    expect(params.getAll("source")).toEqual(["Himalayas"]);
    expect(params.has("page")).toBe(false);
  });

  it("preserves other query parameters when clearing filters", async () => {
    const user = userEvent.setup();

    navigation.query =
      "q=frontend&location=Singapore&source=Himalayas&company=Example&postedWithin=7&page=3";

    render(<JobFilters />);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    const params = lastNavigation().searchParams;

    expect(params.get("q")).toBe("frontend");
    expect(params.get("location")).toBe("Singapore");
    expect(params.has("source")).toBe(false);
    expect(params.has("company")).toBe(false);
    expect(params.has("postedWithin")).toBe(false);
    expect(params.has("page")).toBe(false);
  });

  it("uses the current route when updating the URL", async () => {
    const user = userEvent.setup();

    navigation.pathname = "/jobs";

    render(<JobFilters />);

    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(lastNavigation().pathname).toBe("/jobs");
  });

  it.each(["source", "company", "postedWithin"])(
    "switches back to Apply when the applied %s filter is edited",
    async (field) => {
      const user = userEvent.setup();
      const onClear = vi.fn();

      navigation.query = "source=Himalayas&company=Example&postedWithin=7";

      render(<JobFilters onClear={onClear} />);

      if (field === "source") {
        await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
      } else if (field === "company") {
        await user.type(
          screen.getByRole("textbox", { name: "Company" }),
          " Updated",
        );
      } else {
        await user.selectOptions(
          screen.getByRole("combobox", { name: "Date posted" }),
          "30",
        );
      }

      expect(
        screen.getByRole("button", { name: "Apply filters" }),
      ).toBeInTheDocument();
      expect(navigation.push).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    },
  );

  it("replaces old filters rather than appending duplicate parameters", async () => {
    const user = userEvent.setup();

    navigation.query = "source=Himalayas&company=Old&postedWithin=7&page=2";

    render(<JobFilters />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));

    const company = screen.getByRole("textbox", { name: "Company" });

    await user.clear(company);
    await user.type(company, "New");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Date posted" }),
      "30",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    const params = lastNavigation().searchParams;

    expect(params.getAll("source")).toEqual(["Remote OK"]);
    expect(params.getAll("company")).toEqual(["New"]);
    expect(params.getAll("postedWithin")).toEqual(["30"]);
    expect(params.has("page")).toBe(false);
  });

  it("restores controls when URL parameters change", () => {
    const { rerender } = render(<JobFilters />);

    navigation.query = "source=Remote+OK&company=Updated&postedWithin=30";

    rerender(<JobFilters />);

    expect(screen.getByRole("checkbox", { name: "Remote OK" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue(
      "Updated",
    );
    expect(screen.getByRole("combobox", { name: "Date posted" })).toHaveValue(
      "30",
    );

    navigation.query = "";

    rerender(<JobFilters />);

    expect(
      screen.getByRole("checkbox", { name: "Remote OK" }),
    ).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("applies filters when Enter is pressed in the company input", async () => {
    const user = userEvent.setup();

    render(<JobFilters />);

    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "Example{Enter}",
    );

    expect(lastNavigation().searchParams.get("company")).toBe("Example");
  });
});
