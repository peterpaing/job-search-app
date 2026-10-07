import { describe, expect, it } from "vitest";
import {
  weWorkRemotelyJobSchema,
  weWorkRemotelyResponseSchema,
} from "../../schemas/we-work-remotely.schema.js";

const validJob = {
  title: "Example: Frontend Engineer",
  link: "https://weworkremotely.com/remote-jobs/example-frontend-engineer",
  guid: "example-123",
  region: "Anywhere in the World",
  categories: ["Front-End Programming"],
  pubDate: "Thu, 08 Oct 2026 00:00:00 GMT",
};

describe("weWorkRemotelyJobSchema", () => {
  it("accepts a valid job", () => {
    expect(weWorkRemotelyJobSchema.parse(validJob)).toEqual(validJob);
  });

  it("trims the title", () => {
    const result = weWorkRemotelyJobSchema.parse({
      ...validJob,
      title: "  Example: Frontend Engineer  ",
    });

    expect(result.title).toBe("Example: Frontend Engineer");
  });

  it("accepts missing optional fields", () => {
    const job = {
      title: validJob.title,
      link: validJob.link,
      pubDate: validJob.pubDate,
    };

    expect(weWorkRemotelyJobSchema.parse(job)).toEqual(job);
  });

  it.each(["title", "link", "pubDate"])(
    "rejects a missing required field: %s",
    (field) => {
      const job: Record<string, unknown> = { ...validJob };
      delete job[field];

      expect(weWorkRemotelyJobSchema.safeParse(job).success).toBe(false);
    },
  );

  it.each(["", "   "])("rejects a blank title: %s", (title) => {
    expect(
      weWorkRemotelyJobSchema.safeParse({
        ...validJob,
        title,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid link", () => {
    expect(
      weWorkRemotelyJobSchema.safeParse({
        ...validJob,
        link: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it.each(["invalid-date", ""])(
    "rejects an invalid publication date: %s",
    (pubDate) => {
      expect(
        weWorkRemotelyJobSchema.safeParse({
          ...validJob,
          pubDate,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a numeric publication date", () => {
    expect(
      weWorkRemotelyJobSchema.safeParse({
        ...validJob,
        pubDate: 123,
      }).success,
    ).toBe(false);
  });

  it("rejects non-string categories", () => {
    expect(
      weWorkRemotelyJobSchema.safeParse({
        ...validJob,
        categories: ["Programming", 123],
      }).success,
    ).toBe(false);
  });

  it("accepts an empty categories array", () => {
    expect(
      weWorkRemotelyJobSchema.safeParse({
        ...validJob,
        categories: [],
      }).success,
    ).toBe(true);
  });
});

describe("weWorkRemotelyResponseSchema", () => {
  it("accepts a response containing items", () => {
    expect(weWorkRemotelyResponseSchema.parse({ items: [validJob] })).toEqual({
      items: [validJob],
    });
  });

  it("accepts an empty items array", () => {
    expect(weWorkRemotelyResponseSchema.parse({ items: [] })).toEqual({
      items: [],
    });
  });

  it("ignores extra feed metadata", () => {
    expect(
      weWorkRemotelyResponseSchema.parse({
        title: "We Work Remotely",
        link: "https://weworkremotely.com",
        items: [validJob],
      }),
    ).toEqual({ items: [validJob] });
  });

  it("rejects a missing items field", () => {
    expect(weWorkRemotelyResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects items that are not an array", () => {
    expect(
      weWorkRemotelyResponseSchema.safeParse({
        items: validJob,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid items", () => {
    expect(
      weWorkRemotelyResponseSchema.safeParse({
        items: [{ ...validJob, pubDate: "invalid-date" }],
      }).success,
    ).toBe(false);
  });
});
