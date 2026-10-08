import { describe, expect, it } from "vitest";
import { jobsQuerySchema } from "../../schemas/jobs-query.schema.js";

const emptyQuery = {
  q: "",
  location: "",
  company: "",
  sources: [],
  postedWithin: "",
};

const validSources = [
  "Remote OK",
  "We Work Remotely",
  "Himalayas",
  "Dev Global Jobs",
];

describe("jobsQuerySchema", () => {
  it("provides defaults when no query parameters are supplied", () => {
    expect(jobsQuerySchema.parse({})).toEqual(emptyQuery);
  });

  it("accepts a complete query and renames source to sources", () => {
    expect(
      jobsQuerySchema.parse({
        q: "Frontend",
        location: "Singapore",
        company: "Example",
        source: ["Himalayas", "Remote OK"],
        postedWithin: "7",
      }),
    ).toEqual({
      q: "Frontend",
      location: "Singapore",
      company: "Example",
      sources: ["Himalayas", "Remote OK"],
      postedWithin: "7",
    });
  });

  it("trims text query parameters", () => {
    expect(
      jobsQuerySchema.parse({
        q: "  Frontend Engineer  ",
        location: "  Singapore  ",
        company: "  Example Company  ",
      }),
    ).toEqual({
      ...emptyQuery,
      q: "Frontend Engineer",
      location: "Singapore",
      company: "Example Company",
    });
  });

  it("converts whitespace-only text values to empty strings", () => {
    expect(
      jobsQuerySchema.parse({
        q: "   ",
        location: "   ",
        company: "   ",
      }),
    ).toEqual(emptyQuery);
  });

  it.each(validSources)(
    "accepts the single source %s and converts it to an array",
    (source) => {
      expect(jobsQuerySchema.parse({ source })).toEqual({
        ...emptyQuery,
        sources: [source],
      });
    },
  );

  it("accepts all four sources", () => {
    expect(
      jobsQuerySchema.parse({
        source: validSources,
      }),
    ).toEqual({
      ...emptyQuery,
      sources: validSources,
    });
  });

  it("accepts an empty source array", () => {
    expect(jobsQuerySchema.parse({ source: [] })).toEqual(emptyQuery);
  });

  it("deduplicates sources while preserving their order", () => {
    expect(
      jobsQuerySchema.parse({
        source: ["Himalayas", "Remote OK", "Himalayas"],
      }),
    ).toEqual({
      ...emptyQuery,
      sources: ["Himalayas", "Remote OK"],
    });
  });

  it.each(["", "1", "7", "30"])(
    "accepts postedWithin value %j",
    (postedWithin) => {
      expect(jobsQuerySchema.parse({ postedWithin })).toEqual({
        ...emptyQuery,
        postedWithin,
      });
    },
  );

  it.each(["0", "2", "14", "31", "-1", "week", " 7 "])(
    "rejects unsupported postedWithin value %j",
    (postedWithin) => {
      expect(jobsQuerySchema.safeParse({ postedWithin }).success).toBe(false);
    },
  );

  it.each([7, null, ["7"], { value: "7" }])(
    "rejects a non-string postedWithin value: %j",
    (postedWithin) => {
      expect(jobsQuerySchema.safeParse({ postedWithin }).success).toBe(false);
    },
  );

  it.each(["Unknown", "himalayas", "remote ok", ""])(
    "rejects unsupported source %j",
    (source) => {
      expect(jobsQuerySchema.safeParse({ source }).success).toBe(false);
    },
  );

  it("rejects an unknown source inside an array", () => {
    expect(
      jobsQuerySchema.safeParse({
        source: ["Himalayas", "Unknown"],
      }).success,
    ).toBe(false);
  });

  it.each([123, null, { value: "Himalayas" }, [123]])(
    "rejects a malformed source value: %j",
    (source) => {
      expect(jobsQuerySchema.safeParse({ source }).success).toBe(false);
    },
  );

  it("rejects more than four source entries before deduplication", () => {
    expect(
      jobsQuerySchema.safeParse({
        source: [
          "Himalayas",
          "Remote OK",
          "We Work Remotely",
          "Dev Global Jobs",
          "Himalayas",
        ],
      }).success,
    ).toBe(false);
  });

  it.each(["q", "location", "company"])(
    "accepts 200 characters in %s",
    (field) => {
      const value = "a".repeat(200);

      expect(
        jobsQuerySchema.safeParse({
          [field]: value,
        }).success,
      ).toBe(true);
    },
  );

  it.each(["q", "location", "company"])(
    "rejects more than 200 characters in %s",
    (field) => {
      expect(
        jobsQuerySchema.safeParse({
          [field]: "a".repeat(201),
        }).success,
      ).toBe(false);
    },
  );

  it.each(["q", "location", "company"])(
    "checks the length of %s after trimming",
    (field) => {
      expect(
        jobsQuerySchema.safeParse({
          [field]: `  ${"a".repeat(200)}  `,
        }).success,
      ).toBe(true);
    },
  );

  it.each(["q", "location", "company"])(
    "rejects numbers, null, arrays and objects in %s",
    (field) => {
      for (const value of [
        123,
        null,
        ["Frontend", "Backend"],
        { value: "Frontend" },
      ]) {
        expect(
          jobsQuerySchema.safeParse({
            [field]: value,
          }).success,
        ).toBe(false);
      }
    },
  );

  it("uses defaults for explicitly undefined fields", () => {
    expect(
      jobsQuerySchema.parse({
        q: undefined,
        location: undefined,
        company: undefined,
        source: undefined,
        postedWithin: undefined,
      }),
    ).toEqual(emptyQuery);
  });

  it("ignores unrelated query parameters", () => {
    expect(
      jobsQuerySchema.parse({
        q: "Frontend",
        page: "3",
        sort: "newest",
      }),
    ).toEqual({
      ...emptyQuery,
      q: "Frontend",
    });
  });

  it("preserves special characters in text searches", () => {
    expect(
      jobsQuerySchema.parse({
        q: "C++ & React",
        company: "Example_100%",
      }),
    ).toEqual({
      ...emptyQuery,
      q: "C++ & React",
      company: "Example_100%",
    });
  });

  it.each([null, undefined, "Frontend", 123, []])(
    "rejects a non-object query: %j",
    (query) => {
      expect(jobsQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  it("identifies the invalid field in validation issues", () => {
    const result = jobsQuerySchema.safeParse({
      postedWithin: "14",
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["postedWithin"],
        }),
      ]),
    );
  });
});
