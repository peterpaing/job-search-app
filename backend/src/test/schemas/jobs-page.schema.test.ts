import { describe, expect, it } from "vitest";
import { jobsPageQuerySchema } from "../../schemas/jobs-page.schema.js";

describe("jobsPageQuerySchema", () => {
  it("defaults to page one", () => {
    expect(jobsPageQuerySchema.parse({})).toEqual({
      q: "",
      location: "",
      company: "",
      sources: [],
      postedWithin: "",
      page: 1,
    });
  });

  it.each(["1", "2", "99", "1000000"])(
    "converts page=%s to a number",
    (page) => {
      expect(jobsPageQuerySchema.parse({ page }).page).toBe(Number(page));
    },
  );

  it.each([
    "",
    "0",
    "-1",
    "1.5",
    "abc",
    " 2 ",
    "02",
    "1e2",
    "1000001",
    "9007199254740993",
  ])("rejects invalid page=%j", (page) => {
    const result = jobsPageQuerySchema.safeParse({ page });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["page"] })]),
      );
    }
  });

  it.each([2, null, ["1", "2"], { value: "2" }])(
    "rejects malformed page values: %j",
    (page) => {
      expect(jobsPageQuerySchema.safeParse({ page }).success).toBe(false);
    },
  );

  it("preserves validated filters alongside the page", () => {
    expect(
      jobsPageQuerySchema.parse({
        q: "  React  ",
        location: "  Singapore  ",
        company: "  Acme  ",
        source: ["Himalayas", "Remote OK", "Himalayas"],
        postedWithin: "7",
        page: "2",
      }),
    ).toEqual({
      q: "React",
      location: "Singapore",
      company: "Acme",
      sources: ["Himalayas", "Remote OK"],
      postedWithin: "7",
      page: 2,
    });
  });

  it.each([
    { source: "Unknown" },
    { postedWithin: "14" },
    { q: "a".repeat(201) },
  ])("still rejects invalid search filters: %j", (query) => {
    expect(jobsPageQuerySchema.safeParse(query).success).toBe(false);
  });

  it("ignores unrelated parameters", () => {
    expect(
      jobsPageQuerySchema.parse({ page: "2", sort: "newest" }),
    ).not.toHaveProperty("sort");
  });
});
