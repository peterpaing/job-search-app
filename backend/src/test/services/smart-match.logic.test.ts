import { describe, expect, it } from "vitest";
import {
  cacheKey,
  normalizeQuestion,
  profileSchema,
  rankJobs,
} from "../../services/smart-match.logic.js";
import type { DatabaseJob } from "../../db/schema.js";

const profile = {
  skills: ["React", "TypeScript"],
  roles: ["Frontend Engineer"],
  experience: "mid" as const,
  location: "",
  workMode: "any" as const,
};

function job(overrides: Partial<DatabaseJob> = {}): DatabaseJob {
  return {
    id: "job-a",
    source: "Test",
    title: "Frontend Engineer",
    company: "Example",
    companyLogo: null,
    description: "Build applications with React and TypeScript.",
    location: "Remote",
    country: null,
    tags: ["React", "TypeScript"],
    url: "https://example.com/job-a",
    postedAt: "2026-10-12T00:00:00.000Z",
    isActive: true,
    lastSeenAt: "2026-10-12T00:00:00.000Z",
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("SmartMatch logic", () => {
  it("requires at least one skill", () => {
    expect(
      profileSchema.safeParse({
        ...profile,
        skills: [],
      }).success,
    ).toBe(false);
  });

  it("rejects client-provided premium or identity fields", () => {
    expect(
      profileSchema.safeParse({
        ...profile,
        premium: true,
        userId: "forged",
      }).success,
    ).toBe(false);
  });

  it("ranks stronger skill overlap first", () => {
    const matches = rankJobs(profile, [
      job({
        id: "partial",
        description: "React",
        tags: ["React"],
      }),
      job({ id: "strong" }),
    ]);

    expect(matches.map((match) => match.job.id)).toEqual(["strong", "partial"]);

    expect(matches[0]?.strength).toBe("strong");
    expect(matches[1]?.strength).toBe("partial");
  });

  it("does not match Java inside JavaScript", () => {
    const matches = rankJobs(
      {
        ...profile,
        skills: ["Java"],
      },
      [
        job({
          title: "JavaScript Developer",
          description: "JavaScript applications",
          tags: ["JavaScript"],
        }),
      ],
    );

    expect(matches).toEqual([]);
  });

  it("excludes inactive jobs", () => {
    expect(rankJobs(profile, [job({ isActive: false })])).toEqual([]);
  });

  it("applies the remote preference to confirmed work modes", () => {
    const matches = rankJobs(
      {
        ...profile,
        workMode: "remote",
      },
      [
        job({
          id: "office",
          location: "On-site, London",
        }),
        job({
          id: "remote",
          location: "Remote, United Kingdom",
        }),
      ],
    );

    expect(matches.map((match) => match.job.id)).toEqual(["remote"]);
  });

  it("excludes jobs without skill overlap or a matching role", () => {
    const matches = rankJobs(profile, [
      job({
        title: "Python Engineer",
        description: "Python and Django",
        tags: ["Python"],
      }),
    ]);

    expect(matches).toEqual([]);
  });

  it("limits the shortlist to twelve jobs", () => {
    const records = Array.from({ length: 20 }, (_, index) =>
      job({ id: `job-${index}` }),
    );

    expect(rankJobs(profile, records)).toHaveLength(12);
  });

  it("separates cached answers by user", () => {
    expect(cacheKey("user-a", "answer", profile, "question")).not.toBe(
      cacheKey("user-b", "answer", profile, "question"),
    );
  });

  it("changes the cache key when profile or listing changes", () => {
    const original = cacheKey("user-a", "answer", profile, "listing-v1");

    expect(original).not.toBe(
      cacheKey(
        "user-a",
        "answer",
        {
          ...profile,
          experience: "senior",
        },
        "listing-v1",
      ),
    );

    expect(original).not.toBe(
      cacheKey("user-a", "answer", profile, "listing-v2"),
    );
  });

  it("normalizes whitespace without changing question case", () => {
    expect(normalizeQuestion("  Explain   my fit.\n")).toBe("Explain my fit.");
  });

  it("recognises common skill aliases", () => {
    const matches = rankJobs(
      {
        ...profile,
        skills: ["node.js", "next.js", "tailwind css"],
        roles: [],
      },
      [
        job({
          title: "Web Developer",
          tags: ["NodeJS", "NextJS", "TailwindCSS"],
          description: "",
        }),
      ],
    );

    expect(matches[0]?.matchedSkills).toEqual([
      "Node.js",
      "Next.js",
      "Tailwind CSS",
    ]);
  });

  it("deduplicates skill aliases before scoring", () => {
    const matches = rankJobs(
      {
        ...profile,
        skills: ["React", "ReactJS"],
        roles: [],
      },
      [job()],
    );

    expect(matches[0]?.matchedSkills).toEqual(["React"]);
  });

  it("includes unknown work modes without claiming they are remote", () => {
    const matches = rankJobs(
      {
        ...profile,
        workMode: "remote",
      },
      [
        job({
          location: "United States",
          description: "",
        }),
      ],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.workMode).toBe("unknown");
  });

  it("excludes confirmed on-site jobs for a remote preference", () => {
    const matches = rankJobs(
      {
        ...profile,
        workMode: "remote",
      },
      [job({ location: "On-site, London" })],
    );

    expect(matches).toEqual([]);
  });

  it("labels role-only recommendations as related", () => {
    const matches = rankJobs(
      {
        ...profile,
        skills: ["React"],
        roles: ["Full stack developer"],
      },
      [
        job({
          title: "Senior Full-Stack Engineer",
          tags: ["technology"],
          description: "",
        }),
      ],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.strength).toBe("related");
    expect(matches[0]?.matchedSkills).toEqual([]);
  });
});
