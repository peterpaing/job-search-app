import { describe, expect, it } from "vitest";
import type { DatabaseJob } from "../../db/schema.js";
import {
  cacheKey,
  getJobWorkMode,
  normalizeQuestion,
  profileSchema,
  rankJobs,
  type MatchProfile,
} from "../../services/smart-match.logic.js";
import {
  analyzeListing,
  MAX_SMART_MATCH_RESULTS,
} from "../../services/smart-match.matching.js";

const NOW = new Date("2026-10-13T12:00:00.000Z");

const profile: MatchProfile = {
  skills: ["React", "TypeScript"],
  roles: ["Frontend Engineer"],
  experience: "mid",
  location: "",
  workMode: "any",
};

function job(overrides: Partial<DatabaseJob> = {}): DatabaseJob {
  return {
    id: "job-a",
    source: "Test",
    title: "Frontend Engineer",
    company: "Example",
    companyLogo: null,

    description: "Requirements:\nReact and TypeScript.",

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

function rank(records: DatabaseJob[], overrides: Partial<MatchProfile> = {}) {
  return rankJobs(
    {
      ...profile,
      ...overrides,
    },
    records,
    NOW,
  );
}

describe("SmartMatch profile and cache", () => {
  it("requires at least one skill", () => {
    expect(
      profileSchema.safeParse({
        ...profile,
        skills: [],
      }).success,
    ).toBe(false);
  });

  it("rejects forged premium and identity fields", () => {
    expect(
      profileSchema.safeParse({
        ...profile,
        premium: true,
        userId: "forged",
      }).success,
    ).toBe(false);
  });

  it("separates cached answers by user", () => {
    expect(cacheKey("user-a", "answer", profile, "question")).not.toBe(
      cacheKey("user-b", "answer", profile, "question"),
    );
  });

  it("changes cache keys when listing data changes", () => {
    expect(cacheKey("user-a", "answer", profile, "listing-v1")).not.toBe(
      cacheKey("user-a", "answer", profile, "listing-v2"),
    );
  });

  it("changes cache keys when the profile changes", () => {
    expect(cacheKey("user-a", "answer", profile)).not.toBe(
      cacheKey("user-a", "answer", {
        ...profile,
        experience: "senior",
      }),
    );
  });

  it("normalizes question whitespace", () => {
    expect(normalizeQuestion("  Explain   my fit.\n")).toBe("Explain my fit.");
  });
});

describe("description evidence", () => {
  it("separates required and preferred skills", () => {
    const signals = analyzeListing(
      job({
        description:
          "Requirements:\nReact and TypeScript.\n" +
          "Nice to have:\nNode.js and Python.",
      }),
    );

    expect(signals.requiredSkills).toEqual(
      expect.arrayContaining(["React", "TypeScript"]),
    );

    expect(signals.preferredSkills).toEqual(
      expect.arrayContaining(["Node.js", "Python"]),
    );

    expect(signals.requiredSkills).not.toContain("Python");
  });

  it("does not turn responsibilities into requirements", () => {
    const signals = analyzeListing(
      job({
        description:
          "Responsibilities:\n" +
          "Build applications with React and TypeScript.",
      }),
    );

    expect(signals.requiredSkills).toEqual([]);

    expect(signals.mentionedSkills).toEqual(
      expect.arrayContaining(["React", "TypeScript"]),
    );
  });

  it("treats not-required skills as optional", () => {
    const signals = analyzeListing(
      job({
        description: "Python is not required.",
      }),
    );

    expect(signals.requiredSkills).not.toContain("Python");

    expect(signals.preferredSkills).toContain("Python");
  });

  it("ignores company and benefits sections", () => {
    const signals = analyzeListing(
      job({
        description:
          "About us:\nOur other products use Python.\n" +
          "Requirements:\nReact and TypeScript.",
      }),
    );

    expect(signals.requiredSkills).not.toContain("Python");

    expect(signals.mentionedSkills).not.toContain("Python");
  });

  it("does not use negated technology statements", () => {
    const signals = analyzeListing(
      job({
        description: "We do not use Python.",
      }),
    );

    expect(signals.mentionedSkills).not.toContain("Python");
  });

  it("extracts explicit country restrictions", () => {
    const signals = analyzeListing(
      job({
        description:
          "Requirements:\nReact and TypeScript.\n" +
          "Candidates must be based in the United States.",
      }),
    );

    expect(signals.restrictedCountries).toEqual(["United States"]);
  });
});

describe("recent matching windows", () => {
  it("shows 7-day matches without older filler", () => {
    const matches = rank([
      job({
        id: "older",
        postedAt: "2026-10-01T00:00:00Z",
      }),
      job({
        id: "recent",
        postedAt: "2026-10-12T00:00:00Z",
      }),
    ]);

    expect(matches.map((match) => match.job.id)).toEqual(["recent"]);
  });

  it("expands to 30 days when no recent job qualifies", () => {
    const matches = rank([
      job({
        id: "recent-unrelated",
        title: "Backend Python Engineer",
        description: "Requirements:\nPython and Django.",
        tags: ["Python", "Django"],
        postedAt: "2026-10-12T00:00:00Z",
      }),
      job({
        id: "older-match",
        postedAt: "2026-10-01T00:00:00Z",
      }),
    ]);

    expect(matches.map((match) => match.job.id)).toEqual(["older-match"]);
  });

  it("returns no jobs older than 30 days", () => {
    expect(
      rank([
        job({
          postedAt: "2026-09-01T00:00:00Z",
        }),
      ]),
    ).toEqual([]);
  });

  it("sorts newest qualifying jobs first", () => {
    const matches = rank([
      job({
        id: "older-strong",
        postedAt: "2026-10-10T00:00:00Z",
      }),
      job({
        id: "newer-partial",
        description: "Requirements:\nReact.",
        tags: ["React"],
        postedAt: "2026-10-12T00:00:00Z",
      }),
    ]);

    expect(matches.map((match) => match.job.id)).toEqual([
      "newer-partial",
      "older-strong",
    ]);
  });

  it("uses stronger evidence to break equal-date ties", () => {
    const matches = rank([
      job({
        id: "partial",
        description: "Requirements:\nReact.",
        tags: ["React"],
      }),
      job({
        id: "strong",
      }),
    ]);

    expect(matches.map((match) => match.job.id)).toEqual(["strong", "partial"]);
  });

  it("limits results to twenty", () => {
    const records = Array.from({ length: 35 }, (_, index) =>
      job({
        id: `job-${index}`,
      }),
    );

    expect(rank(records)).toHaveLength(MAX_SMART_MATCH_RESULTS);

    expect(MAX_SMART_MATCH_RESULTS).toBe(20);
  });

  it("does not fill a small recent list with older jobs", () => {
    const older = Array.from({ length: 25 }, (_, index) =>
      job({
        id: `older-${index}`,
        postedAt: "2026-10-01T00:00:00Z",
      }),
    );

    const matches = rank([job({ id: "recent" }), ...older]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.job.id).toBe("recent");
  });

  it("includes the exact 7-day boundary", () => {
    const matches = rank([
      job({
        postedAt: "2026-10-06T12:00:00Z",
      }),
    ]);

    expect(matches).toHaveLength(1);
  });

  it("includes the exact 30-day fallback boundary", () => {
    const matches = rank([
      job({
        postedAt: "2026-09-13T12:00:00Z",
      }),
    ]);

    expect(matches).toHaveLength(1);
  });

  it("excludes invalid and future publication dates", () => {
    expect(
      rank([
        job({
          id: "invalid",
          postedAt: "invalid",
        }),
        job({
          id: "future",
          postedAt: "2026-10-14T00:00:00Z",
        }),
      ]),
    ).toEqual([]);
  });

  it("excludes inactive jobs", () => {
    expect(rank([job({ isActive: false })])).toEqual([]);
  });
});

describe("skill and role relevance", () => {
  it("does not match Java inside JavaScript", () => {
    expect(
      rank(
        [
          job({
            title: "JavaScript Developer",
            description: "Requirements:\nJavaScript.",
            tags: ["JavaScript"],
          }),
        ],
        {
          skills: ["Java"],
          roles: [],
        },
      ),
    ).toEqual([]);
  });

  it("does not match C inside C++", () => {
    expect(
      rank(
        [
          job({
            title: "C++ Developer",
            description: "Requirements:\nC++.",
            tags: ["C++"],
          }),
        ],
        {
          skills: ["C"],
          roles: [],
        },
      ),
    ).toEqual([]);
  });

  it("recognizes common aliases", () => {
    const matches = rank(
      [
        job({
          title: "Web Developer",
          description: "",
          tags: ["NodeJS", "NextJS", "TailwindCSS"],
        }),
      ],
      {
        skills: ["node.js", "next.js", "tailwind css"],
        roles: [],
      },
    );

    expect(matches[0]?.matchedSkills).toEqual([
      "Node.js",
      "Next.js",
      "Tailwind CSS",
    ]);
  });

  it("deduplicates skill aliases", () => {
    const matches = rank(
      [
        job({
          description: "Requirements:\nReact.",
          tags: ["React"],
        }),
      ],
      {
        skills: ["React", "ReactJS"],
        roles: [],
      },
    );

    expect(matches[0]?.matchedSkills).toEqual(["React"]);
  });

  it("does not recommend role-only jobs without skill evidence", () => {
    expect(
      rank([
        job({
          description: "",
          tags: ["technology"],
        }),
      ]),
    ).toEqual([]);
  });

  it("filters clearly conflicting role families", () => {
    expect(
      rank([
        job({
          title: "DevOps Engineer",
          description: "Requirements:\nReact and TypeScript.",
        }),
      ]),
    ).toEqual([]);
  });

  it("does not let bonus skills override unmatched core requirements", () => {
    expect(
      rank([
        job({
          description:
            "Requirements:\nPython and Django.\n" +
            "Nice to have:\nReact and TypeScript.",
        }),
      ]),
    ).toEqual([]);
  });

  it("marks unmatched requirements as unconfirmed, not strong", () => {
    const matches = rank([
      job({
        description: "Requirements:\nReact, TypeScript and Python.",
      }),
    ]);

    expect(matches).toHaveLength(1);

    expect(matches[0]?.unconfirmedRequiredSkills).toContain("Python");

    expect(matches[0]?.strength).toBe("partial");
  });

  it("does not count one casual description mention as enough evidence", () => {
    expect(
      rank(
        [
          job({
            description: "Our platform occasionally interacts with React.",
            tags: [],
          }),
        ],
        {
          skills: ["React"],
        },
      ),
    ).toEqual([]);
  });

  it("can match useful unstructured descriptions", () => {
    const matches = rank([
      job({
        description: "Build applications with React and TypeScript.",
        tags: [],
      }),
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.strength).toBe("partial");
  });
});

describe("seniority and preferences", () => {
  it("filters senior titles for junior profiles", () => {
    expect(
      rank(
        [
          job({
            title: "Senior Frontend Engineer",
          }),
        ],
        {
          experience: "junior",
        },
      ),
    ).toEqual([]);
  });

  it("keeps uncertain seniority without guessing", () => {
    const matches = rank([job()], { experience: "junior" });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.seniority).toBe("unknown");
  });

  it("does not infer seniority from coworkers", () => {
    const signals = analyzeListing(
      job({
        description:
          "Work with senior engineers.\n" +
          "Requirements:\nReact and TypeScript.",
      }),
    );

    expect(signals.seniority).toBe("unknown");
  });

  it("filters confirmed on-site jobs for remote preferences", () => {
    expect(
      rank(
        [
          job({
            location: "On-site, London",
          }),
        ],
        {
          workMode: "remote",
        },
      ),
    ).toEqual([]);
  });

  it("keeps unknown work modes as unknown", () => {
    const matches = rank(
      [
        job({
          location: "United States",
          description: "",
        }),
      ],
      {
        workMode: "remote",
      },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.workMode).toBe("unknown");
  });

  it("recognizes explicit work mode in descriptions", () => {
    expect(
      getJobWorkMode(
        job({
          location: "United Kingdom",
          description: "This role is fully remote.",
        }),
      ),
    ).toBe("remote");
  });

  it("does not infer remote from collaboration text", () => {
    expect(
      getJobWorkMode(
        job({
          location: "United Kingdom",
          description: "We collaborate with remote teams.",
        }),
      ),
    ).toBe("unknown");
  });

  it("filters a clear country-preference conflict", () => {
    expect(
      rank(
        [
          job({
            location: "Remote, US only",
          }),
        ],
        {
          location: "United Kingdom",
          workMode: "remote",
        },
      ),
    ).toEqual([]);
  });

  it("does not treat every location as a country restriction", () => {
    const matches = rank(
      [
        job({
          location: "Remote, United States",
        }),
      ],
      {
        location: "United Kingdom",
        workMode: "remote",
      },
    );

    expect(matches).toHaveLength(1);
  });

  it("does not infer residency from an ambiguous preferred city", () => {
    const matches = rank(
      [
        job({
          location: "Remote, US only",
        }),
      ],
      {
        location: "London",
      },
    );

    expect(matches).toHaveLength(1);
  });
});
