import { describe, expect, it } from "vitest";
import {
  remoteOkJobSchema,
  remoteOkResponseSchema,
} from "../../schemas/remote-ok.schema.js";

const validJob = {
  id: "123",
  position: "Frontend Engineer",
  company: "Example",
  company_logo: "https://example.com/logo.png",
  location: "Singapore",
  tags: ["react", "typescript"],
  url: "https://remoteok.com/remote-jobs/example-123",
  date: "2026-10-07T00:00:00Z",
};

describe("remoteOkJobSchema", () => {
  it("accepts a valid job", () => {
    expect(remoteOkJobSchema.parse(validJob)).toEqual(validJob);
  });

  it("accepts missing optional fields", () => {
    const job = {
      id: validJob.id,
      position: validJob.position,
      company: validJob.company,
      url: validJob.url,
      date: validJob.date,
    };

    expect(remoteOkJobSchema.parse(job)).toEqual(job);
  });

  it("accepts empty logo and location strings", () => {
    const result = remoteOkJobSchema.safeParse({
      ...validJob,
      company_logo: "",
      location: "",
    });

    expect(result.success).toBe(true);
  });

  it.each(["id", "position", "company", "url", "date"])(
    "rejects a missing required field: %s",
    (field) => {
      const job: Record<string, unknown> = { ...validJob };
      delete job[field];

      expect(remoteOkJobSchema.safeParse(job).success).toBe(false);
    },
  );

  it("rejects an invalid URL", () => {
    expect(
      remoteOkJobSchema.safeParse({
        ...validJob,
        url: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("rejects a numeric ID", () => {
    expect(
      remoteOkJobSchema.safeParse({
        ...validJob,
        id: 123,
      }).success,
    ).toBe(false);
  });

  it("rejects tags that are not strings", () => {
    expect(
      remoteOkJobSchema.safeParse({
        ...validJob,
        tags: ["react", 123],
      }).success,
    ).toBe(false);
  });
});

describe("remoteOkResponseSchema", () => {
  const metadata = {
    last_updated: 1791331200,
    legal: "API terms",
  };

  it("removes the first metadata entry and returns jobs", () => {
    expect(remoteOkResponseSchema.parse([metadata, validJob])).toEqual([
      validJob,
    ]);
  });

  it("preserves multiple jobs after the metadata entry", () => {
    const secondJob = {
      ...validJob,
      id: "456",
      position: "Backend Developer",
    };

    expect(
      remoteOkResponseSchema.parse([metadata, validJob, secondJob]),
    ).toEqual([validJob, secondJob]);
  });

  it("returns an empty array for a metadata-only response", () => {
    expect(remoteOkResponseSchema.parse([metadata])).toEqual([]);
  });

  it("accepts an empty response array", () => {
    expect(remoteOkResponseSchema.parse([])).toEqual([]);
  });

  it("rejects a response that is not an array", () => {
    expect(remoteOkResponseSchema.safeParse({ jobs: [validJob] }).success).toBe(
      false,
    );
  });

  it("rejects an invalid job after the metadata entry", () => {
    expect(
      remoteOkResponseSchema.safeParse([
        metadata,
        { ...validJob, position: null },
      ]).success,
    ).toBe(false);
  });
});
