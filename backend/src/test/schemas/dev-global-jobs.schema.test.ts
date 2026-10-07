import { describe, expect, it } from "vitest";
import {
  devGlobalJobSchema,
  devGlobalJobsResponseSchema,
} from "../../schemas/dev-global-jobs.schema.js";

const validJob = {
  id: 123,
  title: "Frontend Engineer",
  organization: "Example",
  location: "Singapore",
  country: "SG",
  category: "technology",
  jobType: "Full-time",
  postedAt: "2026-10-08T00:00:00Z",
  url: "https://devglobaljobs.com/jobs/detail/123",
};

describe("devGlobalJobSchema", () => {
  it("accepts a valid job", () => {
    expect(devGlobalJobSchema.parse(validJob)).toEqual(validJob);
  });

  it("accepts missing optional fields", () => {
    const job = {
      id: validJob.id,
      title: validJob.title,
      organization: validJob.organization,
      postedAt: validJob.postedAt,
      url: validJob.url,
    };

    expect(devGlobalJobSchema.parse(job)).toEqual(job);
  });

  it("accepts null optional fields", () => {
    const job = {
      ...validJob,
      location: null,
      country: null,
      category: null,
      jobType: null,
    };

    expect(devGlobalJobSchema.parse(job)).toEqual(job);
  });

  it.each(["id", "title", "organization", "postedAt", "url"])(
    "rejects a missing required field: %s",
    (field) => {
      const job: Record<string, unknown> = { ...validJob };
      delete job[field];

      expect(devGlobalJobSchema.safeParse(job).success).toBe(false);
    },
  );

  it("rejects a string ID", () => {
    expect(
      devGlobalJobSchema.safeParse({
        ...validJob,
        id: "123",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-integer ID", () => {
    expect(
      devGlobalJobSchema.safeParse({
        ...validJob,
        id: 123.5,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid URL", () => {
    expect(
      devGlobalJobSchema.safeParse({
        ...validJob,
        url: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("rejects a numeric posted date", () => {
    expect(
      devGlobalJobSchema.safeParse({
        ...validJob,
        postedAt: 123,
      }).success,
    ).toBe(false);
  });

  it.each(["location", "country", "category", "jobType"])(
    "rejects a non-string optional field: %s",
    (field) => {
      expect(
        devGlobalJobSchema.safeParse({
          ...validJob,
          [field]: 123,
        }).success,
      ).toBe(false);
    },
  );

  it("strips undeclared fields", () => {
    expect(
      devGlobalJobSchema.parse({
        ...validJob,
        featured: true,
        salary: "$100,000",
      }),
    ).toEqual(validJob);
  });
});

describe("devGlobalJobsResponseSchema", () => {
  it("accepts a response containing jobs", () => {
    expect(devGlobalJobsResponseSchema.parse({ jobs: [validJob] })).toEqual({
      jobs: [validJob],
    });
  });

  it("accepts an empty jobs array", () => {
    expect(devGlobalJobsResponseSchema.parse({ jobs: [] })).toEqual({
      jobs: [],
    });
  });

  it("ignores response metadata", () => {
    expect(
      devGlobalJobsResponseSchema.parse({
        meta: {
          total: 100,
          limit: 100,
          offset: 0,
        },
        jobs: [validJob],
      }),
    ).toEqual({ jobs: [validJob] });
  });

  it("rejects a missing jobs field", () => {
    expect(devGlobalJobsResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects jobs that are not an array", () => {
    expect(
      devGlobalJobsResponseSchema.safeParse({
        jobs: validJob,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid job inside the response", () => {
    expect(
      devGlobalJobsResponseSchema.safeParse({
        jobs: [{ ...validJob, title: null }],
      }).success,
    ).toBe(false);
  });
});
