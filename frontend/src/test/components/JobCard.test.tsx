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

  it("links to the job details in a new tab", () => {
    render(<JobCard job={job} />);

    const link = screen.getByRole("link", {
      name: "View Frontend Engineer at Example (opens in a new tab)",
    });

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
});
