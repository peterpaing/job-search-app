import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import JobFilters from "../../app/component/JobFilters";

describe("JobFilters", () => {
  it("renders the heading and all four sources", () => {
    render(<JobFilters />);

    expect(
      screen.getByRole("heading", { name: "Filters" }),
    ).toBeInTheDocument();

    const sources = [
      "Remote OK",
      "We Work Remotely",
      "Himalayas",
      "Dev Global Jobs",
    ];

    expect(screen.getAllByRole("checkbox")).toHaveLength(4);

    for (const source of sources) {
      expect(screen.getByRole("checkbox", { name: source })).not.toBeChecked();
    }
  });

  it("starts with empty filters and an Apply filters button", () => {
    render(<JobFilters />);

    expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue("");

    expect(screen.getByRole("combobox", { name: "Date posted" })).toHaveValue(
      "",
    );

    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it("does not render removed or duplicate filters", () => {
    render(<JobFilters />);

    for (const label of [
      "Employment type",
      "Experience level",
      "Salary disclosed only",
      "Location",
      "Country",
      "Sort by",
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it("allows selecting and deselecting multiple sources", async () => {
    const user = userEvent.setup();

    render(<JobFilters />);

    const remoteOk = screen.getByRole("checkbox", {
      name: "Remote OK",
    });
    const himalayas = screen.getByRole("checkbox", {
      name: "Himalayas",
    });

    await user.click(remoteOk);
    await user.click(himalayas);

    expect(remoteOk).toBeChecked();
    expect(himalayas).toBeChecked();

    await user.click(remoteOk);

    expect(remoteOk).not.toBeChecked();
    expect(himalayas).toBeChecked();
  });

  it.each([
    ["Past 24 hours", "1"],
    ["Past 7 days", "7"],
    ["Past 30 days", "30"],
    ["Any time", ""],
  ])("allows selecting %s", async (label, value) => {
    const user = userEvent.setup();

    render(<JobFilters />);

    const select = screen.getByRole("combobox", {
      name: "Date posted",
    });

    await user.selectOptions(select, label);

    expect(select).toHaveValue(value);
  });

  it("does not apply filters while editing inputs", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClear = vi.fn();

    render(<JobFilters onApply={onApply} onClear={onClear} />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "Example",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Date posted" }),
      "7",
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("applies selected filters and trims the company name", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "  Example  ",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Date posted" }),
      "7",
    );

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      sources: ["Remote OK", "Himalayas"],
      company: "Example",
      postedWithin: "7",
    });

    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("can apply empty filters", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(onApply).toHaveBeenCalledWith({
      sources: [],
      company: "",
      postedWithin: "",
    });
  });

  it("clears all inputs and calls onClear after filters are applied", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClear = vi.fn();

    render(<JobFilters onApply={onApply} onClear={onClear} />);

    await user.click(screen.getByRole("checkbox", { name: "Himalayas" }));
    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "Example",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Date posted" }),
      "30",
    );

    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);

    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).not.toBeChecked();
    }

    expect(screen.getByRole("textbox", { name: "Company" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Date posted" })).toHaveValue(
      "",
    );
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });

  it.each(["source", "company", "date"])(
    "returns to Apply filters when %s changes after applying",
    async (field) => {
      const user = userEvent.setup();
      const onApply = vi.fn();
      const onClear = vi.fn();

      render(<JobFilters onApply={onApply} onClear={onClear} />);

      await user.click(screen.getByRole("button", { name: "Apply filters" }));

      if (field === "source") {
        await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
      } else if (field === "company") {
        await user.type(
          screen.getByRole("textbox", { name: "Company" }),
          "Example",
        );
      } else {
        await user.selectOptions(
          screen.getByRole("combobox", { name: "Date posted" }),
          "7",
        );
      }

      expect(
        screen.getByRole("button", { name: "Apply filters" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Clear filters" }),
      ).not.toBeInTheDocument();

      expect(onApply).toHaveBeenCalledTimes(1);
      expect(onClear).not.toHaveBeenCalled();
    },
  );

  it("applies updated selections after editing applied filters", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await user.click(screen.getByRole("checkbox", { name: "Remote OK" }));
    await user.click(screen.getByRole("checkbox", { name: "Dev Global Jobs" }));

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply).toHaveBeenLastCalledWith({
      sources: ["Dev Global Jobs"],
      company: "",
      postedWithin: "",
    });

    // Previously submitted values must remain unchanged.
    expect(onApply.mock.calls[0][0]).toEqual({
      sources: ["Remote OK"],
      company: "",
      postedWithin: "",
    });
  });

  it("supports submitting with the Enter key", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<JobFilters onApply={onApply} />);

    await user.type(
      screen.getByRole("textbox", { name: "Company" }),
      "Example{Enter}",
    );

    expect(onApply).toHaveBeenCalledWith({
      sources: [],
      company: "Example",
      postedWithin: "",
    });
  });

  it("allows applying and clearing without callbacks", async () => {
    const user = userEvent.setup();

    render(<JobFilters />);

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
  });
});
