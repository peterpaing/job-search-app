import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobSearch from "../../app/component/JobSearch";

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

function keywordInput() {
  return screen.getByRole("searchbox", {
    name: "Job title or keyword",
  });
}

function locationInput() {
  return screen.getByRole("textbox", {
    name: "Country or city",
  });
}

function lastNavigation() {
  const calls = navigation.push.mock.calls;
  const destination = calls[calls.length - 1]?.[0];

  expect(typeof destination).toBe("string");

  return new URL(destination, "http://localhost:3000");
}

describe("JobSearch", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.pathname = "/";
    navigation.query = "";
  });

  it("renders the search form with empty inputs", () => {
    render(<JobSearch />);

    expect(
      screen.getByRole("search", { name: "Search developer jobs" }),
    ).toBeInTheDocument();
    expect(keywordInput()).toHaveValue("");
    expect(locationInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not show clear buttons for empty inputs", () => {
    render(<JobSearch />);

    expect(
      screen.queryByRole("button", { name: "Clear job title or keyword" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear country or city" }),
    ).not.toBeInTheDocument();
  });

  it("allows editing both inputs without navigating", async () => {
    const user = userEvent.setup();

    render(<JobSearch />);

    await user.type(keywordInput(), "Frontend Developer");
    await user.type(locationInput(), "Singapore");

    expect(keywordInput()).toHaveValue("Frontend Developer");
    expect(locationInput()).toHaveValue("Singapore");
    expect(
      screen.getByRole("button", { name: "Clear job title or keyword" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear country or city" }),
    ).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("restores search values from the URL", () => {
    navigation.query = "q=Frontend+Developer&location=Singapore";

    render(<JobSearch />);

    expect(keywordInput()).toHaveValue("Frontend Developer");
    expect(locationInput()).toHaveValue("Singapore");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("clears the keyword, focuses its input and immediately updates the URL", async () => {
    const user = userEvent.setup();
    navigation.query = "q=Frontend+Developer&location=Singapore";

    render(<JobSearch />);

    await user.click(
      screen.getByRole("button", { name: "Clear job title or keyword" }),
    );

    expect(keywordInput()).toHaveValue("");
    expect(keywordInput()).toHaveFocus();
    expect(locationInput()).toHaveValue("Singapore");
    expect(
      screen.queryByRole("button", { name: "Clear job title or keyword" }),
    ).not.toBeInTheDocument();

    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(lastNavigation().searchParams.has("q")).toBe(false);
    expect(lastNavigation().searchParams.get("location")).toBe("Singapore");
  });

  it("clears the location, focuses its input and immediately updates the URL", async () => {
    const user = userEvent.setup();
    navigation.query = "q=Frontend+Developer&location=Singapore";

    render(<JobSearch />);

    await user.click(
      screen.getByRole("button", { name: "Clear country or city" }),
    );

    expect(locationInput()).toHaveValue("");
    expect(locationInput()).toHaveFocus();
    expect(keywordInput()).toHaveValue("Frontend Developer");
    expect(
      screen.queryByRole("button", { name: "Clear country or city" }),
    ).not.toBeInTheDocument();

    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(lastNavigation().searchParams.has("location")).toBe(false);
    expect(lastNavigation().searchParams.get("q")).toBe("Frontend Developer");
  });

  it("updates and trims the search when Search is clicked", async () => {
    const user = userEvent.setup();

    render(<JobSearch />);

    await user.type(keywordInput(), "  C++ & React  ");
    await user.type(locationInput(), "  New York  ");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const url = lastNavigation();

    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("q")).toBe("C++ & React");
    expect(url.searchParams.get("location")).toBe("New York");
    expect(keywordInput()).toHaveValue("C++ & React");
    expect(locationInput()).toHaveValue("New York");
    expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledWith(expect.any(String), {
      scroll: false,
    });
  });

  it("preserves filters and resets URL pagination when searching", async () => {
    const user = userEvent.setup();

    navigation.query =
      "source=Himalayas&source=Remote+OK&company=Example&postedWithin=7&page=3";

    render(<JobSearch />);

    await user.type(keywordInput(), "Frontend");
    await user.type(locationInput(), "Singapore");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const params = lastNavigation().searchParams;

    expect(params.getAll("source")).toEqual(["Himalayas", "Remote OK"]);
    expect(params.get("company")).toBe("Example");
    expect(params.get("postedWithin")).toBe("7");
    expect(params.get("q")).toBe("Frontend");
    expect(params.get("location")).toBe("Singapore");
    expect(params.has("page")).toBe(false);
  });

  it("removes the keyword without clicking Search", async () => {
    const user = userEvent.setup();
    navigation.query = "q=Frontend&location=Singapore";

    render(<JobSearch />);

    await user.click(
      screen.getByRole("button", { name: "Clear job title or keyword" }),
    );

    const params = lastNavigation().searchParams;

    expect(params.has("q")).toBe(false);
    expect(params.get("location")).toBe("Singapore");
  });

  it("removes the location without clicking Search", async () => {
    const user = userEvent.setup();
    navigation.query = "q=Frontend&location=Singapore";

    render(<JobSearch />);

    await user.click(
      screen.getByRole("button", { name: "Clear country or city" }),
    );

    const params = lastNavigation().searchParams;

    expect(params.get("q")).toBe("Frontend");
    expect(params.has("location")).toBe(false);
  });

  it("removes both search parameters without restoring the first cleared field", async () => {
    const user = userEvent.setup();
    navigation.query = "q=Frontend&location=Singapore&page=2";

    render(<JobSearch />);

    await user.click(
      screen.getByRole("button", { name: "Clear job title or keyword" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Clear country or city" }),
    );

    expect(navigation.push).toHaveBeenCalledTimes(2);
    expect(navigation.push).toHaveBeenLastCalledWith("/", {
      scroll: false,
    });
    expect(keywordInput()).toHaveValue("");
    expect(locationInput()).toHaveValue("");
  });

  it("keeps filters when both inputs are manually cleared and Search is clicked", async () => {
    const user = userEvent.setup();

    navigation.query =
      "q=Frontend&location=Singapore&source=Himalayas&company=Example";

    render(<JobSearch />);

    await user.clear(keywordInput());
    await user.clear(locationInput());
    await user.click(screen.getByRole("button", { name: "Search" }));

    const params = lastNavigation().searchParams;

    expect(params.has("q")).toBe(false);
    expect(params.has("location")).toBe(false);
    expect(params.getAll("source")).toEqual(["Himalayas"]);
    expect(params.get("company")).toBe("Example");
  });

  it("omits whitespace-only search values", async () => {
    const user = userEvent.setup();

    render(<JobSearch />);

    await user.type(keywordInput(), "   ");
    await user.type(locationInput(), "   ");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(navigation.push).toHaveBeenCalledWith("/", { scroll: false });
    expect(keywordInput()).toHaveValue("");
    expect(locationInput()).toHaveValue("");
  });

  it("replaces previous search values without duplicate parameters", async () => {
    const user = userEvent.setup();
    navigation.query = "q=Frontend&location=Singapore";

    render(<JobSearch />);

    await user.clear(keywordInput());
    await user.type(keywordInput(), "Backend");
    await user.clear(locationInput());
    await user.type(locationInput(), "Malaysia");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const params = lastNavigation().searchParams;

    expect(params.getAll("q")).toEqual(["Backend"]);
    expect(params.getAll("location")).toEqual(["Malaysia"]);
  });

  it("uses the current route when submitting", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/jobs";

    render(<JobSearch />);

    await user.type(keywordInput(), "Frontend");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(lastNavigation().pathname).toBe("/jobs");
  });

  it("submits when Enter is pressed", async () => {
    const user = userEvent.setup();

    render(<JobSearch />);

    await user.type(keywordInput(), "Frontend{Enter}");

    expect(lastNavigation().searchParams.get("q")).toBe("Frontend");
  });

  it("restores inputs when the URL changes", () => {
    const { rerender } = render(<JobSearch />);

    navigation.query = "q=Backend&location=Malaysia";

    rerender(<JobSearch />);

    expect(keywordInput()).toHaveValue("Backend");
    expect(locationInput()).toHaveValue("Malaysia");

    navigation.query = "";

    rerender(<JobSearch />);

    expect(keywordInput()).toHaveValue("");
    expect(locationInput()).toHaveValue("");
  });

  it.each([
    ["q", "Clear job title or keyword"],
    ["location", "Clear country or city"],
  ])(
    "clearing applied %s preserves filters and removes pagination",
    async (field, label) => {
      const user = userEvent.setup();

      navigation.query =
        "q=React&location=Singapore&source=Himalayas&source=Remote+OK&company=Acme&postedWithin=7&page=3";

      render(<JobSearch />);

      await user.click(screen.getByRole("button", { name: label }));

      const params = lastNavigation().searchParams;

      expect(params.has(field)).toBe(false);
      expect(params.get(field === "q" ? "location" : "q")).toBe(
        field === "q" ? "Singapore" : "React",
      );
      expect(params.getAll("source")).toEqual(["Himalayas", "Remote OK"]);
      expect(params.get("company")).toBe("Acme");
      expect(params.get("postedWithin")).toBe("7");
      expect(params.has("page")).toBe(false);
      expect(navigation.push).toHaveBeenCalledWith(expect.any(String), {
        scroll: false,
      });
    },
  );

  it.each([
    ["keyword", "Clear job title or keyword"],
    ["location", "Clear country or city"],
  ])(
    "clears an unapplied %s draft without navigating",
    async (field, label) => {
      const user = userEvent.setup();

      render(<JobSearch />);

      const input = field === "keyword" ? keywordInput() : locationInput();

      await user.type(input, "Draft");
      await user.click(screen.getByRole("button", { name: label }));

      expect(input).toHaveValue("");
      expect(input).toHaveFocus();
      expect(navigation.push).not.toHaveBeenCalled();
    },
  );

  it("clearing the keyword does not apply an edited location draft", async () => {
    const user = userEvent.setup();
    navigation.query = "q=React&location=Singapore";

    render(<JobSearch />);

    await user.clear(locationInput());
    await user.type(locationInput(), "Malaysia");
    await user.click(
      screen.getByRole("button", { name: "Clear job title or keyword" }),
    );

    expect(lastNavigation().searchParams.has("q")).toBe(false);
    expect(lastNavigation().searchParams.get("location")).toBe("Singapore");
  });

  it("clearing the location does not apply an edited keyword draft", async () => {
    const user = userEvent.setup();
    navigation.query = "q=React&location=Singapore";

    render(<JobSearch />);

    await user.clear(keywordInput());
    await user.type(keywordInput(), "Python");
    await user.click(
      screen.getByRole("button", { name: "Clear country or city" }),
    );

    expect(lastNavigation().searchParams.has("location")).toBe(false);
    expect(lastNavigation().searchParams.get("q")).toBe("React");
  });
});
