import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaginationFocus,
  requestPaginationFocus,
  restorePaginationFocus,
} from "../../app/lib/pagination-focus";

function createTarget() {
  const target = document.createElement("div");

  target.tabIndex = -1;

  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });

  document.body.append(target);

  return target;
}

describe("pagination focus", () => {
  beforeEach(() => {
    clearPaginationFocus();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    clearPaginationFocus();
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("does not move focus on an ordinary page load", () => {
    const target = createTarget();

    restorePaginationFocus(target);

    expect(target).not.toHaveFocus();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it("restores focus after the initiating pagination control unmounts", () => {
    const button = document.createElement("button");

    document.body.append(button);
    button.focus();

    requestPaginationFocus("/?q=react&page=2");
    button.remove();

    window.history.replaceState(null, "", "/?page=2&q=react");

    const target = createTarget();

    restorePaginationFocus(target);

    expect(target).toHaveFocus();
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "instant",
      block: "start",
    });
  });

  it("does not steal focus from another control", () => {
    const button = document.createElement("button");
    const input = document.createElement("input");

    document.body.append(button, input);
    button.focus();

    requestPaginationFocus("/?page=2");

    input.focus();
    window.history.replaceState(null, "", "/?page=2");

    const target = createTarget();

    restorePaginationFocus(target);

    expect(input).toHaveFocus();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not apply a focus request to a different search", () => {
    requestPaginationFocus("/?q=react&page=2");

    window.history.replaceState(null, "", "/?q=python&page=2");

    const target = createTarget();

    restorePaginationFocus(target);

    expect(target).not.toHaveFocus();
  });

  it("discards expired focus requests", () => {
    const now = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(now);

    requestPaginationFocus("/?page=2");

    vi.mocked(Date.now).mockReturnValue(now + 30_001);
    window.history.replaceState(null, "", "/?page=2");

    const target = createTarget();

    restorePaginationFocus(target);

    expect(target).not.toHaveFocus();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });
});
