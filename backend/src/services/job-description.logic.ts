import { compile } from "html-to-text";

export const MAX_DESCRIPTION_CHARS = 20_000;
const MAX_SOURCE_CHARS = 120_000;

const convertDescription = compile({
  wordwrap: false,
  preserveNewlines: true,

  limits: {
    maxInputLength: MAX_SOURCE_CHARS,
    maxDepth: 40,
    maxChildNodes: 5_000,
  },

  selectors: [
    { selector: "script", format: "skip" },
    { selector: "style", format: "skip" },
    { selector: "noscript", format: "skip" },
    { selector: "iframe", format: "skip" },
    { selector: "img", format: "skip" },

    {
      selector: "a",
      options: {
        ignoreHref: true,
      },
    },

    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
    { selector: "h3", options: { uppercase: false } },
    { selector: "h4", options: { uppercase: false } },
    { selector: "h5", options: { uppercase: false } },
    { selector: "h6", options: { uppercase: false } },
  ],
});

export function sourceDescription(...values: unknown[]): {
  description?: string;
} {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return {
        description: value,
      };
    }
  }

  return {};
}

export function normalizeJobDescription(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const text = convertDescription(value.slice(0, MAX_SOURCE_CHARS))
      .replaceAll("\u0000", "")
      .replaceAll("\u00a0", " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    let limited = text.slice(0, MAX_DESCRIPTION_CHARS);

    // Avoid cutting an emoji or another surrogate pair in half.
    if (/[\uD800-\uDBFF]$/.test(limited)) {
      limited = limited.slice(0, -1);
    }

    return limited.trim() || null;
  } catch {
    // An unreadable description must not discard the whole job.
    return null;
  }
}
