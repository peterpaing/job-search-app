import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
};

async function openDetails() {
  const user = userEvent.setup();

  await user.click(
    screen.getByRole("button", {
      name: "Usage details",
    }),
  );
}

describe("SmartMatchUsage scrolling", () => {
  it("closes when the page scrolls", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    fireEvent.scroll(window);

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Usage details",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when the card's own content scrolls", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    const card = screen.getByRole("complementary", {
      name: "AI usage allowance",
    });

    const previousMaxHeight = card.style.maxHeight;

    fireEvent.scroll(card);

    expect(
      screen.getByRole("region", {
        name: "AI usage details",
      }),
    ).toBeInTheDocument();

    expect(card.style.maxHeight).toBe(previousMaxHeight);
  });

  it("closes when a scrollable ancestor moves", async () => {
    render(
      <div data-testid="scroll-container">
        <SmartMatchUsage usage={usage} />
      </div>,
    );

    await openDetails();

    fireEvent.scroll(screen.getByTestId("scroll-container"));

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();
  });

  it("closes when the viewport resizes", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    fireEvent.resize(window);

    expect(
      screen.queryByRole("region", {
        name: "AI usage details",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses a stacking level below the navbar", async () => {
    render(<SmartMatchUsage usage={usage} />);

    await openDetails();

    const card = screen.getByRole("complementary", {
      name: "AI usage allowance",
    });

    expect(card.parentElement).toHaveClass("z-40");
  });
});
