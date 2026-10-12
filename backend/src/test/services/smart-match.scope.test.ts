import { describe, expect, it } from "vitest";
import { cacheKey } from "../../services/smart-match.logic.js";
import {
  JOB_SCOPE_VERSION,
  OUT_OF_SCOPE_MESSAGE,
  isClearlyGenericCodingQuestion,
  jobAnswerSchema,
  toPublicJobAnswer,
} from "../../services/smart-match.scope.js";

describe("SmartMatch scope", () => {
  it.each([
    "what is the <p> tag and <div>?",
    "Teach me JavaScript.",
    "Explain React.",
    "Write a sorting algorithm.",
    "Debug this Python function.",
  ])("detects an obvious generic coding request: %s", (question) => {
    expect(isClearlyGenericCodingQuestion(question)).toBe(true);
  });

  it.each([
    "Explain my fit for this job.",
    "What should I highlight in my application?",
    "Suggest interview practice questions.",
    "What does React mean for this role's requirements?",
  ])(
    "leaves job-context questions for the model scope check: %s",
    (question) => {
      expect(isClearlyGenericCodingQuestion(question)).toBe(false);
    },
  );

  it("never releases content classified as out of scope", () => {
    const result = toPublicJobAnswer({
      scope: "out_of_scope",
      answer: "This unrelated content must not reach the user.",
    });

    expect(result).toEqual({
      answer: OUT_OF_SCOPE_MESSAGE,
      outOfScope: true,
    });
  });

  it("releases a job-related answer", () => {
    expect(
      toPublicJobAnswer({
        scope: "job_related",
        answer: "Highlight the React experience in your profile.",
      }),
    ).toEqual({
      answer: "Highlight the React experience in your profile.",
      outOfScope: false,
    });
  });

  it("rejects unrecognised scope values", () => {
    expect(
      jobAnswerSchema.safeParse({
        scope: "anything",
        answer: "An answer.",
      }).success,
    ).toBe(false);
  });

  it("rejects empty job-related answers", () => {
    expect(
      jobAnswerSchema.safeParse({
        scope: "job_related",
        answer: "",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty out-of-scope answer", () => {
    expect(
      jobAnswerSchema.safeParse({
        scope: "out_of_scope",
        answer: "",
      }).success,
    ).toBe(true);
  });

  it("uses a different cache key from older unscoped answers", () => {
    const inputs = [
      { skills: ["React"] },
      "profile-version",
      { id: "job-a" },
      "job-version",
      "Explain my fit.",
    ];

    const previous = cacheKey("user-a", "answer", ...inputs);

    const scoped = cacheKey("user-a", "answer", JOB_SCOPE_VERSION, ...inputs);

    expect(scoped).not.toBe(previous);
  });
});
