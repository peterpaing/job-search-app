import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import JobCard, { type Job } from "../../app/component/JobCard";

const job: Job = {
  id: "remote-ok-123",
  source: "Remote OK",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "Build developer tools.",
  location: "Singapore",
  tags: ["react", "typescript", "frontend", "javascript", "css"],
  url: "https://remoteok.com/remote-jobs/example-123",
  postedAt: "2026-10-07T00:00:00Z",
};

describe("JobCard", () => {
  it("renders the company, title, location and source", () => {
    render(<JobCard job={job} />);

    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Frontend Engineer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Singapore")).toBeInTheDocument();
    expect(screen.getByText("Source: Remote OK")).toBeInTheDocument();
  });

  it("renders the company logo when provided", () => {
    render(
      <JobCard
        job={{
          ...job,
          companyLogo: "https://example.com/logo.png",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Example logo" })).toHaveAttribute(
      "src",
      "https://example.com/logo.png",
    );
    expect(screen.queryByText("E")).not.toBeInTheDocument();
  });

  it("renders the company initial when no logo is provided", () => {
    render(<JobCard job={job} />);

    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each([
    ["Acme", "A", "bg-blue-100", "text-blue-800"],
    ["Beta", "B", "bg-purple-100", "text-purple-800"],
    ["Cloud", "C", "bg-emerald-100", "text-emerald-800"],
    ["Delta", "D", "bg-amber-100", "text-amber-800"],
    ["Example", "E", "bg-rose-100", "text-rose-800"],
    ["Frontend", "F", "bg-cyan-100", "text-cyan-800"],
  ])(
    "uses the expected initial and colors for %s",
    (company, initial, backgroundColor, textColor) => {
      render(<JobCard job={{ ...job, company }} />);

      const fallback = screen.getByText(initial);

      expect(fallback).toHaveClass(backgroundColor, textColor);
      expect(fallback).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("repeats the color palette for later letters", () => {
    render(<JobCard job={{ ...job, company: "Global" }} />);

    expect(screen.getByText("G")).toHaveClass("bg-blue-100", "text-blue-800");
  });

  it("keeps the fallback colors consistent across renders", () => {
    const { rerender } = render(<JobCard job={job} />);
    const initialClasses = screen.getByText("E").className;

    rerender(<JobCard job={{ ...job, title: "Senior Frontend Engineer" }} />);

    expect(screen.getByText("E").className).toBe(initialClasses);
  });

  it("ignores leading whitespace and normalizes the initial to uppercase", () => {
    render(<JobCard job={{ ...job, company: "  acme  " }} />);

    expect(screen.getByText("A")).toHaveClass("bg-blue-100", "text-blue-800");
  });

  it.each(["", "   "])(
    "uses a question mark when the company name is blank",
    (company) => {
      render(<JobCard job={{ ...job, company }} />);

      expect(screen.getByText("?")).toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    },
  );

  it("supports a company name beginning with a number", () => {
    render(<JobCard job={{ ...job, company: "123 Company" }} />);

    expect(screen.getByText("1")).toHaveClass(
      "bg-purple-100",
      "text-purple-800",
    );
  });

  it("supports a company name beginning with a non-Latin character", () => {
    render(<JobCard job={{ ...job, company: "東京 Company" }} />);

    expect(screen.getByText("東")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each(["", "   "])(
    "uses the colored initial when the logo URL is blank",
    (companyLogo) => {
      render(<JobCard job={{ ...job, companyLogo }} />);

      expect(screen.getByText("E")).toHaveClass("bg-rose-100", "text-rose-800");
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    },
  );

  it("uses the colored initial when the company logo fails to load", () => {
    render(
      <JobCard
        job={{
          ...job,
          companyLogo: "https://example.com/broken-logo.png",
        }}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Example logo" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("E")).toHaveClass("bg-rose-100", "text-rose-800");
  });

  it("keeps a failed logo hidden when unrelated job details change", () => {
    const companyLogo = "https://example.com/broken-logo.png";
    const { rerender } = render(<JobCard job={{ ...job, companyLogo }} />);

    fireEvent.error(screen.getByRole("img", { name: "Example logo" }));

    rerender(
      <JobCard
        job={{
          ...job,
          companyLogo,
          title: "Senior Frontend Engineer",
        }}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
  });

  it("tries the new logo when the logo URL changes after a failure", () => {
    const { rerender } = render(
      <JobCard
        job={{
          ...job,
          companyLogo: "https://example.com/broken-logo.png",
        }}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Example logo" }));

    rerender(
      <JobCard
        job={{
          ...job,
          companyLogo: "https://example.com/new-logo.png",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Example logo" })).toHaveAttribute(
      "src",
      "https://example.com/new-logo.png",
    );
    expect(screen.queryByText("E")).not.toBeInTheDocument();
  });

  it("updates the initial and colors when the company changes", () => {
    const { rerender } = render(<JobCard job={job} />);

    rerender(<JobCard job={{ ...job, company: "Acme" }} />);

    expect(screen.queryByText("E")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toHaveClass("bg-blue-100", "text-blue-800");
  });

  it("renders a fallback when the location is missing", () => {
    render(<JobCard job={{ ...job, location: null }} />);

    expect(screen.getByText("Location not specified")).toBeInTheDocument();
  });

  it("shows only the first four tags", () => {
    render(<JobCard job={job} />);

    for (const tag of job.tags.slice(0, 4)) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }

    expect(screen.queryByText("css")).not.toBeInTheDocument();
  });

  it("renders correctly without tags", () => {
    render(<JobCard job={{ ...job, tags: [] }} />);

    expect(
      screen.getByRole("heading", { name: job.title }),
    ).toBeInTheDocument();
    expect(screen.queryByText("react")).not.toBeInTheDocument();
  });

  it("links to the job details in a new tab", () => {
    render(<JobCard job={job} />);

    const link = screen.getByRole("link", {
      name: "View Frontend Engineer at Example (opens in a new tab)",
    });

    expect(link).toHaveTextContent("View job details");
    expect(link).toHaveAttribute("href", job.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders the source as plain text rather than a link", () => {
    render(<JobCard job={job} />);

    expect(screen.getByText("Source: Remote OK").closest("a")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("does not display the description", () => {
    render(<JobCard job={job} />);

    expect(screen.queryByText(job.description)).not.toBeInTheDocument();
  });

  it("displays the posted date with a machine-readable timestamp", () => {
    render(<JobCard job={job} />);

    const time = screen.getByText("Oct 7, 2026");

    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2026-10-07T00:00:00.000Z");
    expect(time.parentElement).toHaveTextContent("Posted Oct 7, 2026");
  });

  it("formats a Himalayas ISO timestamp correctly", () => {
    render(
      <JobCard
        job={{
          ...job,
          source: "Himalayas",
          postedAt: "2026-10-08T00:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("Oct 8, 2026")).toBeInTheDocument();
    expect(screen.getByText("Source: Himalayas")).toBeInTheDocument();
  });

  it("formats the posted date consistently in UTC", () => {
    render(
      <JobCard
        job={{
          ...job,
          postedAt: "2026-10-08T00:30:00+06:30",
        }}
      />,
    );

    expect(screen.getByText("Oct 7, 2026")).toHaveAttribute(
      "dateTime",
      "2026-10-07T18:00:00.000Z",
    );
  });

  it("shows a fallback for an invalid posted date", () => {
    render(<JobCard job={{ ...job, postedAt: "invalid-date" }} />);

    expect(screen.getByText("Posted date unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });

  it("shows a fallback for an empty posted date", () => {
    render(<JobCard job={{ ...job, postedAt: "" }} />);

    expect(screen.getByText("Posted date unavailable")).toBeInTheDocument();
  });
});
