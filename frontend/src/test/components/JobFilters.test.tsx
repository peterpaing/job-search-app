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

function companyInput() {
  return screen.getByRole("textbox", { name: "Company" });
}

function dateSelect() {
  return screen.getByRole("combobox", { name: "Date posted" });
}

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

  it("renders the controls with empty defaults", () => {
    render(<JobFilters />);

    expect(
      screen.getByRole("heading", { name: "Filters" }),
    ).toBeInTheDocument();

    for (const source of sources) {
      expect(screen.getByRole("checkbox", { name: source })).not.toBeChecked();
    }

    expect(companyInput()).toHaveValue("");
    expect(dateSelect()).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not render the removed controls", () => {
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

  it("allows selecting and deselecting an unapplied source without navigating", async () => {
    const user = userEvent.setup();

    render(<JobFilters />);

    const checkbox = screen.getByRole("checkbox", { name: "Himalayas" });

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
  ])("allows selecting %s without applying it", async (label, value) => {
    const user = userEvent.setup();

    render(<JobFilters />);

    await user.selectOptions(dateSelect(), label);

    expect(dateSelect()).toHaveValue(value);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not navigate while selecting new filters or typing", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.type(companyInput(), "Example");
    await user.selectOptions(dateSelect(), "7");

    expect(navigation.push).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("adds selected filters to the URL when Apply is clicked", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.type(companyInput(), "  Example & Company  ");
    await user.selectOptions(dateSelect(), "7");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    const url = lastNavigation();

    expect(url.pathname).toBe("/");
    expect(url.searchParams.getAll("source")).toEqual([
      "Himalayas",
      "Remote OK",
    ]);
    expect(url.searchParams.get("company")).toBe("Example & Company");
    expect(url.searchParams.get("postedWithin")).toBe("7");

    expect(navigation.push).toHaveBeenCalledTimes(1);
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

    await user.type(companyInput(), "   ");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(navigation.push).toHaveBeenCalledWith("/", { scroll: false });
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("restores filters from a shared URL", () => {
    navigation.query =
      "source=Himalayas&source=Remote+OK&company=Example&postedWithin=7";

    render(<JobFilters />);

    expect(screen.getByRole("checkbox", { name: "Himalayas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Remote OK" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "We Work Remotely" }),
    ).not.toBeChecked();
    expect(companyInput()).toHaveValue("Example");
    expect(dateSelect()).toHaveValue("7");
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("ignores unknown sources and unsupported dates in the controls", () => {
    navigation.query = "source=Unknown&postedWithin=999";

    render(<JobFilters />);

    for (const source of sources) {
      expect(screen.getByRole("checkbox", { name: source })).not.toBeChecked();
    }

    expect(dateSelect()).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("deduplicates sources restored from the URL", async () => {
    const user = userEvent.setup();
    navigation.query = "source=Himalayas&source=Himalayas";

    render(<JobFilters />);

    await user.type(companyInput(), "Example");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(lastNavigation().searchParams.getAll("source")).toEqual([
      "Himalayas",
    ]);
  });

  it("clears controls and removes all filter parameters", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    navigation.query = "source=Himalayas&company=Example&postedWithin=7&page=3";

    render(<JobFilters onClear={onClear} />);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(navigation.push).toHaveBeenCalledWith("/", { scroll: false });
    expect(onClear).toHaveBeenCalledTimes(1);

    for (const source of sources) {
      expect(screen.getByRole("checkbox", { name: source })).not.toBeChecked();
    }

    expect(companyInput()).toHaveValue("");
    expect(dateSelect()).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("preserves search parameters when applying filters", async () => {
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

  it("preserves search parameters when clearing filters", async () => {
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

  it("uses the current route", async () => {
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
        await user.type(companyInput(), " Updated");
      } else {
        await user.selectOptions(dateSelect(), "30");
      }

      expect(
        screen.getByRole("button", { name: "Apply filters" }),
      ).toBeInTheDocument();
      expect(navigation.push).not.toHaveBeenCalled();
      expect(onClear).not.toHaveBeenCalled();
    },
  );

  it("replaces old filters without duplicating parameters", async () => {
    const user = userEvent.setup();

    navigation.query = "source=Himalayas&company=Old&postedWithin=7&page=2";

    render(<JobFilters />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.clear(companyInput());
    await user.type(companyInput(), "New");
    await user.selectOptions(dateSelect(), "30");
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
    expect(companyInput()).toHaveValue("Updated");
    expect(dateSelect()).toHaveValue("30");

    navigation.query = "";

    rerender(<JobFilters />);

    expect(
      screen.getByRole("checkbox", { name: "Remote OK" }),
    ).not.toBeChecked();
    expect(companyInput()).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("applies filters when Enter is pressed", async () => {
    const user = userEvent.setup();

    render(<JobFilters />);

    await user.type(companyInput(), "Example{Enter}");

    expect(lastNavigation().searchParams.get("company")).toBe("Example");
  });

  it("immediately removes an applied source and preserves other criteria", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    navigation.query =
      "q=React&location=Singapore&source=Himalayas&source=Remote+OK&company=Example&postedWithin=7&page=3";

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));

    const params = lastNavigation().searchParams;

    expect(params.getAll("source")).toEqual(["Remote OK"]);
    expect(params.get("q")).toBe("React");
    expect(params.get("location")).toBe("Singapore");
    expect(params.get("company")).toBe("Example");
    expect(params.get("postedWithin")).toBe("7");
    expect(params.has("page")).toBe(false);

    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledWith(expect.any(String), {
      scroll: false,
    });
    expect(onApply).toHaveBeenCalledWith({
      sources: ["Remote OK"],
      company: "Example",
      postedWithin: "7",
    });

    expect(
      screen.getByRole("checkbox", { name: "Himalayas" }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Remote OK" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("removes the last applied source without removing the search", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    navigation.query = "q=React&source=Himalayas&page=2";

    render(<JobFilters onClear={onClear} />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));

    const params = lastNavigation().searchParams;

    expect(params.has("source")).toBe(false);
    expect(params.get("q")).toBe("React");
    expect(params.has("page")).toBe(false);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("does not restore a removed source when another source is unchecked", async () => {
    const user = userEvent.setup();

    navigation.query = "source=Himalayas&source=Remote+OK&company=Example";

    render(<JobFilters />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));

    expect(navigation.push).toHaveBeenCalledTimes(2);
    expect(lastNavigation().searchParams.has("source")).toBe(false);
    expect(lastNavigation().searchParams.get("company")).toBe("Example");
  });

  it("removing an applied source does not apply company or date drafts", async () => {
    const user = userEvent.setup();

    navigation.query = "source=Himalayas&company=Old&postedWithin=7";

    render(<JobFilters />);

    await user.clear(companyInput());
    await user.type(companyInput(), "New");
    await user.selectOptions(dateSelect(), "30");
    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));

    const params = lastNavigation().searchParams;

    expect(params.has("source")).toBe(false);
    expect(params.get("company")).toBe("Old");
    expect(params.get("postedWithin")).toBe("7");
  });

  it("removing an applied source does not apply a new draft source", async () => {
    const user = userEvent.setup();

    navigation.query = "source=Himalayas";

    render(<JobFilters />);

    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));

    expect(navigation.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));

    expect(lastNavigation().searchParams.has("source")).toBe(false);
  });
});
