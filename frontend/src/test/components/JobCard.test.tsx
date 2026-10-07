import { render, screen } from "@testing-library/react";
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
