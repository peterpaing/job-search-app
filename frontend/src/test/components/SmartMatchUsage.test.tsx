import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SmartMatchUsage, {
  type SmartMatchUsageData,
} from "../../app/component/SmartMatchUsage";

const usage: SmartMatchUsageData = {
  used: 3,
  limit: 20,
  remaining: 17,
  resetsAt: "2026-10-14T00:00:00.000Z",

  monthly: {
    used: 30,
    limit: 100,
    remaining: 70,
    resetsAt: "2026-11-01T00:00:00.000Z",
  },

  tokens: {
    daily: {
      committed: 5000,
      limit: 50000,
    },
    monthly: {
      committed: 100000,
      limit: 500000,
    },
    input: 80000,
    cachedInput: 10000,
    output: 10000,
  },

  spending: {
    measuredUsd: 0.05,
    committedUsd: 0.06,
    monthlyLimitUsd: 0.5,
    unresolvedRequests: 0,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SmartMatchUsage", () => {
  it("shows the monthly allowance", () => {
    render(<SmartMatchUsage usage={usage} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "70 / 100 AI requests left this month",
    );

    expect(screen.getByText(/Nov 1, 2026.*00:00 UTC/)).toBeInTheDocument();
  });

  it("starts with details collapsed", () => {
    render(<SmartMatchUsage usage={usage} />);

    expect(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    ).toHaveAttribute("aria-expanded", "false");

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();
  });

  it("expands the original card rather than creating another panel", async () => {
    const user = userEvent.setup();

    render(<SmartMatchUsage usage={usage} />);

    const card = screen.getByRole("complementary", {
      name: "AI usage allowance",
    });

    const wrapper = card.parentElement;

    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      width: 384,
      height: 180,
      top: 100,
      right: 384,
      bottom: 280,
      left: 0,
      toJSON: () => ({}),
    });

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    expect(
      screen.getByRole("complementary", {
        name: "AI usage allowance",
      }),
    ).toBe(card);

    expect(card.parentElement).toBe(wrapper);

    expect(card).toHaveClass("absolute", "top-0");
    expect(card).not.toHaveClass("fixed");

    expect(wrapper).toHaveStyle({
      height: "180px",
    });

    expect(
      within(card).getByRole("region", {
        name: "AI usage details",
      }),
    ).toBeInTheDocument();

    expect(screen.getAllByText("Monthly AI allowance")).toHaveLength(1);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows daily and monthly token allowances", async () => {
    const user = userEvent.setup();

    render(<SmartMatchUsage usage={usage} />);

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    expect(
      screen.getByRole("progressbar", {
        name: "Daily token allowance",
      }),
    ).toHaveAttribute("aria-valuenow", "5000");

    expect(
      screen.getByRole("progressbar", {
        name: "Monthly token allowance",
      }),
    ).toHaveAttribute("aria-valuenow", "100000");

    expect(screen.getByText("100,000 / 500,000")).toBeInTheDocument();
  });

  it("collapses using the original button", async () => {
    const user = userEvent.setup();

    render(<SmartMatchUsage usage={usage} />);

    const trigger = screen.getByRole("button", {
      name: "Usage details",
    });

    await user.click(trigger);
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("complementary", {
        name: "AI usage allowance",
      }),
    ).not.toHaveClass("absolute");
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();

    render(<SmartMatchUsage usage={usage} onRefresh={vi.fn()} />);

    const trigger = screen.getByRole("button", {
      name: "Usage details",
    });

    await user.click(trigger);

    screen
      .getByRole("button", {
        name: "Refresh usage",
      })
      .focus();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();

    expect(trigger).toHaveFocus();
  });

  it("closes on outside interaction without stealing focus", async () => {
    const user = userEvent.setup();

    render(
      <>
        <SmartMatchUsage usage={usage} />
        <button type="button">Outside action</button>
      </>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    const outside = screen.getByRole("button", {
      name: "Outside action",
    });

    await user.click(outside);

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();

    expect(outside).toHaveFocus();
  });

  it("does not show internal spending values", async () => {
    const user = userEvent.setup();

    render(<SmartMatchUsage usage={usage} />);

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    expect(screen.queryByText("$0.50")).not.toBeInTheDocument();

    expect(screen.queryByText("$0.05")).not.toBeInTheDocument();
  });

  it("explains unconfirmed reservations", async () => {
    const user = userEvent.setup();

    render(
      <SmartMatchUsage
        usage={{
          ...usage,
          spending: {
            ...usage.spending!,
            unresolvedRequests: 1,
          },
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    expect(
      screen.getByText(/reserved for active or unconfirmed requests/i),
    ).toBeInTheDocument();
  });

  it("supports daily-only responses", () => {
    render(
      <SmartMatchUsage
        usage={{
          used: 3,
          limit: 20,
          remaining: 17,
          resetsAt: usage.resetsAt,
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "17 / 20 AI generations left today",
    );
  });

  it("explains that cached answers may remain available", () => {
    render(
      <SmartMatchUsage
        usage={{
          ...usage,
          remaining: 0,
          monthly: {
            ...usage.monthly!,
            used: 100,
            remaining: 0,
          },
        }}
      />,
    );

    expect(
      screen.getByText(/Cached answers may still be available/i),
    ).toBeInTheDocument();
  });

  it("refreshes only on click and keeps details open", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();

    render(<SmartMatchUsage usage={usage} onRefresh={refresh} />);

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    expect(refresh).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Refresh usage",
      }),
    );

    expect(refresh).toHaveBeenCalledOnce();

    expect(
      screen.getByRole("region", {
        name: "AI usage details",
      }),
    ).toBeInTheDocument();
  });

  it("disables refresh while busy", async () => {
    const user = userEvent.setup();

    render(
      <SmartMatchUsage usage={usage} onRefresh={vi.fn()} refreshDisabled />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Refresh usage",
      }),
    ).toBeDisabled();
  });

  it("clamps progress when usage exceeds the limit", async () => {
    const user = userEvent.setup();

    render(
      <SmartMatchUsage
        usage={{
          ...usage,
          tokens: {
            ...usage.tokens!,
            monthly: {
              committed: 600000,
              limit: 500000,
            },
          },
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    );

    expect(
      screen.getByRole("progressbar", {
        name: "Monthly token allowance",
      }),
    ).toHaveAttribute("aria-valuenow", "500000");

    expect(
      screen.getByText("Monthly token allowance reached."),
    ).toBeInTheDocument();
  });
});
