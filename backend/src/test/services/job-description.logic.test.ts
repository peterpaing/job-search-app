import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_CHARS,
  normalizeJobDescription,
  sourceDescription,
} from "../../services/job-description.logic.js";

describe("normalizeJobDescription", () => {
  it("converts HTML into readable text", () => {
    const result = normalizeJobDescription(
      "<h2>Requirements</h2>" +
        "<p>Build applications with React.</p>" +
        "<ul><li>TypeScript</li><li>Node.js</li></ul>",
    );

    expect(result).toContain("Requirements");
    expect(result).toContain("Build applications with React.");
    expect(result).toContain("TypeScript");
    expect(result).toContain("Node.js");

    expect(result).not.toContain("<h2>");
    expect(result).not.toContain("<li>");
  });

  it("decodes HTML entities", () => {
    expect(
      normalizeJobDescription("<p>Research &amp; development&nbsp;team</p>"),
    ).toBe("Research & development team");
  });

  it("preserves plain text", () => {
    expect(normalizeJobDescription("Build developer tools.")).toBe(
      "Build developer tools.",
    );
  });

  it("keeps paragraphs separate", () => {
    const result = normalizeJobDescription(
      "<p>First paragraph.</p>" + "<p>Second paragraph.</p>",
    );

    expect(result).toContain("First paragraph.\n\nSecond paragraph.");
  });

  it("removes script and style contents", () => {
    const result = normalizeJobDescription(
      "<script>dangerousScript()</script>" +
        "<style>.secret { color: red; }</style>" +
        "<p>Use React and TypeScript.</p>",
    );

    expect(result).toBe("Use React and TypeScript.");
  });

  it("keeps link text without adding its URL", () => {
    const result = normalizeJobDescription(
      '<p>See <a href="https://example.com/tracking">' +
        "our engineering team</a>.</p>",
    );

    expect(result).toContain("our engineering team");
    expect(result).not.toContain("https://example.com/tracking");
  });

  it.each([
    undefined,
    null,
    "",
    "   ",
    123,
    {},
    [],
    "<p></p>",
    "<script>onlyScript()</script>",
  ])("returns null for unusable content %j", (value) => {
    expect(normalizeJobDescription(value)).toBeNull();
  });

  it("limits stored description length", () => {
    const result = normalizeJobDescription(
      "a".repeat(MAX_DESCRIPTION_CHARS + 1_000),
    );

    expect(result).toHaveLength(MAX_DESCRIPTION_CHARS);
  });

  it("does not split a surrogate pair at the limit", () => {
    const result = normalizeJobDescription(
      "a".repeat(MAX_DESCRIPTION_CHARS - 1) + "😀",
    );

    expect(result).toHaveLength(MAX_DESCRIPTION_CHARS - 1);
  });

  it("removes null characters", () => {
    const result = normalizeJobDescription("React\u0000 developer");

    expect(result).not.toContain("\u0000");
    expect(result).toContain("developer");
  });
});

describe("sourceDescription", () => {
  it("passes through available source HTML", () => {
    expect(sourceDescription("<p>React developer</p>")).toEqual({
      description: "<p>React developer</p>",
    });
  });

  it("uses the first nonblank string", () => {
    expect(
      sourceDescription(null, "   ", "<p>Fallback description</p>"),
    ).toEqual({
      description: "<p>Fallback description</p>",
    });
  });

  it("omits the field when nothing is available", () => {
    expect(sourceDescription(null, undefined, "", 123)).toEqual({});
  });
});
