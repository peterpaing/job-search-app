import { describe, expect, it } from "vitest";
import {
  himalayasJobSchema,
  himalayasResponseSchema,
} from "../../schemas/himalayas.schema.js";

const validJob = {
  guid: "https://himalayas.app/companies/example/jobs/frontend-engineer",
  title: "Frontend Engineer",
  companyName: "Example",
  companyLogo: "https://example.com/logo.png",
  locationRestrictions: ["Singapore"],
  categories: ["React", "Frontend"],
  applicationLink:
    "https://himalayas.app/companies/example/jobs/frontend-engineer",
  pubDate: 1791417600,
};

describe("himalayasJobSchema", () => {
  it("accepts a valid job", () => {
    expect(himalayasJobSchema.parse(validJob)).toEqual(validJob);
  });

  it("accepts missing optional fields", () => {
    const job = {
      guid: validJob.guid,
      title: validJob.title,
      companyName: validJob.companyName,
      applicationLink: validJob.applicationLink,
      pubDate: validJob.pubDate,
    };

    expect(himalayasJobSchema.parse(job)).toEqual(job);
  });

  it("accepts a null company logo", () => {
    expect(
      himalayasJobSchema.safeParse({
        ...validJob,
        companyLogo: null,
      }).success,
    ).toBe(true);
  });

  it("accepts empty location and category arrays", () => {
    expect(
      himalayasJobSchema.safeParse({
        ...validJob,
        locationRestrictions: [],
        categories: [],
      }).success,
    ).toBe(true);
  });

  it.each(["guid", "title", "companyName", "applicationLink", "pubDate"])(
    "rejects a missing required field: %s",
    (field) => {
      const job: Record<string, unknown> = { ...validJob };
      delete job[field];

      expect(himalayasJobSchema.safeParse(job).success).toBe(false);
    },
  );

  it.each(["guid", "applicationLink"])(
    "rejects an invalid URL in %s",
    (field) => {
      expect(
        himalayasJobSchema.safeParse({
          ...validJob,
          [field]: "not-a-url",
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a string publication timestamp", () => {
    expect(
      himalayasJobSchema.safeParse({
        ...validJob,
        pubDate: "1791417600",
      }).success,
    ).toBe(false);
  });

  it("rejects non-string locations", () => {
    expect(
      himalayasJobSchema.safeParse({
        ...validJob,
        locationRestrictions: [123],
      }).success,
    ).toBe(false);
  });

  it("rejects non-string categories", () => {
    expect(
      himalayasJobSchema.safeParse({
        ...validJob,
        categories: [123],
      }).success,
    ).toBe(false);
  });
});

describe("himalayasResponseSchema", () => {
  it("accepts a response containing jobs", () => {
    expect(himalayasResponseSchema.parse({ jobs: [validJob] })).toEqual({
      jobs: [validJob],
    });
  });

  it("accepts an empty jobs array", () => {
    expect(himalayasResponseSchema.parse({ jobs: [] })).toEqual({
      jobs: [],
    });
  });

  it("ignores extra response metadata", () => {
    expect(
      himalayasResponseSchema.parse({
        jobs: [validJob],
        totalCount: 100,
        nextCursor: "example-cursor",
      }),
    ).toEqual({ jobs: [validJob] });
  });

  it("rejects a response without jobs", () => {
    expect(himalayasResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects jobs that are not an array", () => {
    expect(himalayasResponseSchema.safeParse({ jobs: validJob }).success).toBe(
      false,
    );
  });

  it("rejects an invalid job inside the response", () => {
    expect(
      himalayasResponseSchema.safeParse({
        jobs: [{ ...validJob, title: null }],
      }).success,
    ).toBe(false);
  });
});
