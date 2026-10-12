import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_OUTPUT_TOKENS,
  costMicro,
  getCostLimits,
  readTokenUsage,
  reservationFor,
  utcPeriods,
} from "../../services/smart-match.costs.js";

beforeEach(() => {
  vi.stubEnv("SMARTMATCH_USER_DAILY_LIMIT", "20");
  vi.stubEnv("SMARTMATCH_USER_MONTHLY_LIMIT", "100");
  vi.stubEnv("SMARTMATCH_USER_DAILY_TOKEN_LIMIT", "50000");
  vi.stubEnv("SMARTMATCH_USER_MONTHLY_TOKEN_LIMIT", "500000");
  vi.stubEnv("SMARTMATCH_USER_MONTHLY_BUDGET_CENTS", "50");
  vi.stubEnv("SMARTMATCH_DAILY_BUDGET_CENTS", "500");
  vi.stubEnv("SMARTMATCH_MONTHLY_BUDGET_CENTS", "15000");
  vi.stubEnv("SMARTMATCH_MAX_INPUT_TOKENS", "24000");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SmartMatch cost configuration", () => {
  it("defaults to 100 new generations per month", () => {
    vi.stubEnv("SMARTMATCH_USER_MONTHLY_LIMIT", undefined);

    expect(getCostLimits().monthlyRequests).toBe(100);
  });

  it("supports a configurable monthly limit", () => {
    vi.stubEnv("SMARTMATCH_USER_MONTHLY_LIMIT", "2");

    expect(getCostLimits().monthlyRequests).toBe(2);
  });

  it("converts cents to integer micro-USD", () => {
    expect(getCostLimits()).toMatchObject({
      userMonthlyMicro: 500_000,
      globalDailyMicro: 5_000_000,
      globalMonthlyMicro: 150_000_000,
    });
  });

  it("allows zero limits so AI can be disabled", () => {
    vi.stubEnv("SMARTMATCH_USER_MONTHLY_LIMIT", "0");

    expect(getCostLimits().monthlyRequests).toBe(0);
  });

  it.each(["", " ", "-1", "1.5", "NaN", "Infinity", "1000000001"])(
    "rejects invalid monthly limit %j",
    (value) => {
      vi.stubEnv("SMARTMATCH_USER_MONTHLY_LIMIT", value);

      expect(() => getCostLimits()).toThrow(
        "SmartMatch configuration needs attention.",
      );
    },
  );
});

describe("SmartMatch token parsing", () => {
  it("reads input, cached input, and output tokens", () => {
    const usage = {
      input_tokens: 3000,
      output_tokens: 600,
      input_tokens_details: {
        cached_tokens: 2000,
      },
    };

    expect(
      readTokenUsage({
        status: "completed",
        usage,
      }),
    ).toEqual(usage);
  });

  it("reads usage even when a response is incomplete", () => {
    expect(
      readTokenUsage({
        status: "incomplete",
        usage: {
          input_tokens: 3000,
          output_tokens: 1200,
        },
      }),
    ).toEqual({
      input_tokens: 3000,
      output_tokens: 1200,
    });
  });

  it("accepts reported zero usage", () => {
    expect(
      readTokenUsage({
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      }),
    ).toEqual({
      input_tokens: 0,
      output_tokens: 0,
    });
  });

  it.each([
    null,
    undefined,
    {},
    { usage: null },
    { usage: {} },
    {
      usage: {
        input_tokens: -1,
        output_tokens: 1,
      },
    },
    {
      usage: {
        input_tokens: 1.5,
        output_tokens: 1,
      },
    },
    {
      usage: {
        input_tokens: "3000",
        output_tokens: 600,
      },
    },
    {
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: {
          cached_tokens: 101,
        },
      },
    },
  ])("treats missing or invalid usage as unknown: %j", (response) => {
    expect(readTokenUsage(response)).toBeNull();
  });
});

describe("SmartMatch token pricing", () => {
  it("calculates uncached input and output cost", () => {
    expect(
      costMicro({
        input_tokens: 3000,
        output_tokens: 600,
      }),
    ).toBe(2160);
  });

  it("discounts cached input without counting it twice", () => {
    expect(
      costMicro({
        input_tokens: 3000,
        output_tokens: 600,
        input_tokens_details: {
          cached_tokens: 2000,
        },
      }),
    ).toBe(1560);
  });

  it("handles fully cached input", () => {
    expect(
      costMicro({
        input_tokens: 3000,
        output_tokens: 600,
        input_tokens_details: {
          cached_tokens: 3000,
        },
      }),
    ).toBe(1260);
  });

  it("rounds fractional micro-USD upward", () => {
    expect(
      costMicro({
        input_tokens: 1,
        output_tokens: 0,
      }),
    ).toBe(1);
  });

  it("does not invent charges for reported zero usage", () => {
    expect(
      costMicro({
        input_tokens: 0,
        output_tokens: 0,
      }),
    ).toBe(0);
  });
});

describe("SmartMatch request reservations", () => {
  it("includes the full body, framing, and output allowance", () => {
    const body = {
      instructions: "Help with the selected developer job.",
      input: "React developer",
      text: {
        format: {
          schema: {
            type: "object",
          },
        },
      },
    };

    const inputBound = Buffer.byteLength(JSON.stringify(body), "utf8") + 1024;

    const reservation = reservationFor(body);

    expect(reservation).toEqual({
      inputTokens: inputBound,
      totalTokens: inputBound + MAX_OUTPUT_TOKENS,
      micro: costMicro({
        input_tokens: inputBound,
        output_tokens: MAX_OUTPUT_TOKENS,
      }),
    });
  });

  it("uses UTF-8 bytes rather than JavaScript character length", () => {
    const body = {
      input: "မြန်မာ",
    };

    const reservation = reservationFor(body);

    expect(reservation.inputTokens).toBe(
      Buffer.byteLength(JSON.stringify(body), "utf8") + 1024,
    );

    expect(reservation.inputTokens).toBeGreaterThan(
      JSON.stringify(body).length + 1024,
    );
  });

  it("rejects oversized requests before making a reservation", () => {
    vi.stubEnv("SMARTMATCH_MAX_INPUT_TOKENS", "1100");

    expect(() =>
      reservationFor({
        input: "x".repeat(1000),
      }),
    ).toThrow("This request is too large.");
  });
});

describe("SmartMatch UTC resets", () => {
  it("resets daily at UTC midnight", () => {
    expect(utcPeriods(new Date("2026-10-13T18:30:00Z"))).toEqual({
      day: "2026-10-13",
      month: "2026-10-01",
      dailyReset: "2026-10-14T00:00:00.000Z",
      monthlyReset: "2026-11-01T00:00:00.000Z",
    });
  });

  it("handles December to January rollover", () => {
    expect(utcPeriods(new Date("2026-12-31T23:59:59Z"))).toEqual({
      day: "2026-12-31",
      month: "2026-12-01",
      dailyReset: "2027-01-01T00:00:00.000Z",
      monthlyReset: "2027-01-01T00:00:00.000Z",
    });
  });

  it("handles leap years without assuming thirty-day months", () => {
    expect(utcPeriods(new Date("2028-02-29T12:00:00Z")).monthlyReset).toBe(
      "2028-03-01T00:00:00.000Z",
    );
  });
});
