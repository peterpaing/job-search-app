import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TagInput, { mergeTags } from "../../app/component/TagInput";

function Harness({ onSubmit = () => undefined }: { onSubmit?: () => void }) {
  const [values, setValues] = useState<string[]>([]);
  const [input, setInput] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TagInput
        id="skills"
        label="Skills"
        values={values}
        inputValue={input}
        onInputChange={setInput}
        onChange={setValues}
        maxItems={20}
        maxItemLength={60}
      />
    </form>
  );
}

describe("TagInput", () => {
  it("adds a chip with Enter without submitting the form", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();

    render(<Harness onSubmit={submit} />);

    const input = screen.getByRole("textbox", { name: "Skills" });

    await user.type(input, "React{Enter}");

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(submit).not.toHaveBeenCalled();
  });

  it("adds a chip using the Add button", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.type(
      screen.getByRole("textbox", { name: "Skills" }),
      "TypeScript",
    );

    await user.click(screen.getByRole("button", { name: "Add to skills" }));

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("removes a chip", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.type(
      screen.getByRole("textbox", { name: "Skills" }),
      "React{Enter}",
    );

    await user.click(screen.getByRole("button", { name: "Remove React" }));

    expect(screen.queryByText("React")).not.toBeInTheDocument();
  });

  it("ignores case-insensitive duplicates", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.type(
      screen.getByRole("textbox", { name: "Skills" }),
      "React{Enter}react{Enter}",
    );

    expect(
      screen.getAllByRole("button", { name: /Remove React/i }),
    ).toHaveLength(1);
  });

  it("adds a comma-separated pasted list", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("textbox", { name: "Skills" }));

    await user.paste("React, TypeScript, Node.js");

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
  });

  it("includes pending input when saving", () => {
    expect(mergeTags(["React"], "TypeScript", 20, 60)).toEqual([
      "React",
      "TypeScript",
    ]);
  });

  it("rejects too many items instead of silently dropping them", () => {
    expect(() => mergeTags(["React"], "TypeScript", 1, 60)).toThrow(
      "You can add up to 1 items.",
    );
  });
});
