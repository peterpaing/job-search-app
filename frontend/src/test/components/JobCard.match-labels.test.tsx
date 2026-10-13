import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import JobCard, { type Job } from "../../app/component/JobCard";

vi.mock("../../app/component/SaveJobButton", () => ({
  default: () => <button type="button">Save</button>,
}));

vi.mock("../../app/component/ApplicationsProvider", () => ({
  useApplicationVisit: () => undefined,
}));

const job: Job = {
  id: "match-test",
  source: "Example Source",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "",
  location: "Remote",
  tags: [],
  url: "https://example.com/jobs/frontend",
  postedAt: "2026-10-13T00:00:00Z",
};

describe("JobCard match labels", () => {
  it("shows exceptional matches in gold", () => {
    render(
      <JobCard
        job={job}
        matchDetails={{
          strength: "strong",
          workMode: "remote",
          matchedSkills: ["React", "TypeScript"],
        }}
      />,
    );

    expect(screen.getByText("Exceptional match")).toHaveClass(
      "border-amber-300",
      "bg-amber-50",
      "text-amber-900",
    );

    expect(screen.queryByText("Strong skill overlap")).not.toBeInTheDocument();
  });

  it("shows high matches in green", () => {
    render(
      <JobCard
        job={job}
        matchDetails={{
          strength: "partial",
          workMode: "remote",
          matchedSkills: ["React"],
        }}
      />,
    );

    expect(screen.getByText("High match")).toHaveClass(
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-800",
    );

    expect(screen.queryByText("Partial skill overlap")).not.toBeInTheDocument();
  });

  it("does not add a work-mode badge", () => {
    render(
      <JobCard
        job={job}
        matchDetails={{
          strength: "partial",
          workMode: "unknown",
          matchedSkills: ["React"],
        }}
      />,
    );

    expect(screen.getByText("High match")).toBeInTheDocument();

    expect(screen.queryByText("Work mode unconfirmed")).not.toBeInTheDocument();
  });

  it("keeps matching skills visible", () => {
    render(
      <JobCard
        job={job}
        matchDetails={{
          strength: "strong",
          workMode: "remote",
          matchedSkills: ["React", "TypeScript"],
        }}
      />,
    );

    expect(screen.getByText("Your matching skills")).toBeInTheDocument();

    expect(screen.getByText("React")).toBeInTheDocument();

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("does not add match badges to normal job cards", () => {
    render(<JobCard job={job} />);

    expect(screen.queryByText("Exceptional match")).not.toBeInTheDocument();

    expect(screen.queryByText("High match")).not.toBeInTheDocument();
  });

  it("does not upgrade a legacy related role to high match", () => {
    render(
      <JobCard
        job={job}
        matchDetails={{
          strength: "related",
          workMode: "unknown",
          matchedSkills: [],
        }}
      />,
    );

    expect(screen.getByText("Related role")).toBeInTheDocument();

    expect(screen.queryByText("High match")).not.toBeInTheDocument();
  });

  it("keeps the ask button working", () => {
    const onAsk = vi.fn();

    render(
      <JobCard
        job={job}
        onAsk={onAsk}
        matchDetails={{
          strength: "strong",
          workMode: "remote",
          matchedSkills: ["React"],
        }}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Ask about Frontend Engineer at Example",
    });

    fireEvent.click(button);

    expect(onAsk).toHaveBeenCalledWith(button);
  });
});
