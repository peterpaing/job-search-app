import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  persistVisits,
  restoreVisits,
  storageKeyFor,
} from "../../app/lib/application-visits.storage";
import type { PendingVisit } from "../../app/lib/applications.types";

function visit(id: string, confirmed = false): PendingVisit {
  return {
    job: {
      id,
      title: "Frontend Engineer",
      company: "Example",
      url: `https://example.com/jobs/${id}`,
    },
    confirmed,
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("application visit storage", () => {
  it("preserves existing key names and encodes account IDs", () => {
    expect(storageKeyFor(null)).toBe(
      "dev-jobs:pending-application-visits:v2:guest",
    );

    expect(storageKeyFor("user/a b")).toBe(
      "dev-jobs:pending-application-visits:v2:user:user%2Fa%20b",
    );
  });

  it("restores visits only for their owning account", () => {
    persistVisits(storageKeyFor("account-a"), [visit("job-a")]);

    expect(restoreVisits("account-b")).toEqual([]);
    expect(restoreVisits("account-a")).toEqual([visit("job-a")]);
  });

  it("claims confirmed guest choices only once", () => {
    persistVisits(storageKeyFor(null), [
      visit("confirmed", true),
      visit("unconfirmed"),
    ]);

    expect(restoreVisits("account-a")).toEqual([visit("confirmed", true)]);

    expect(sessionStorage.getItem(storageKeyFor(null))).toBeNull();
    expect(restoreVisits("account-b")).toEqual([]);
  });

  it("keeps the account-owned entry when a guest entry duplicates it", () => {
    const owned = visit("same-job");

    persistVisits(storageKeyFor("account-a"), [owned]);
    persistVisits(storageKeyFor(null), [visit("same-job", true)]);

    expect(restoreVisits("account-a")).toEqual([owned]);
  });

  it("rejects malformed entries and retains the latest ten valid visits", () => {
    const valid = Array.from({ length: 12 }, (_, index) =>
      visit(`job-${index}`),
    );

    sessionStorage.setItem(
      storageKeyFor(null),
      JSON.stringify([null, { confirmed: "yes", job: {} }, ...valid]),
    );

    expect(restoreVisits(null)).toEqual(valid.slice(-10));
  });

  it("returns no visits for malformed JSON", () => {
    sessionStorage.setItem(storageKeyFor(null), "{invalid");

    expect(restoreVisits(null)).toEqual([]);
  });

  it("does not replay legacy choices without an account owner", () => {
    const legacyKey = "dev-jobs:pending-application-visits:v1";

    sessionStorage.setItem(legacyKey, JSON.stringify([visit("legacy", true)]));

    expect(restoreVisits("account-a")).toEqual([]);
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
  });

  it("does not claim guest choices when consuming them fails", () => {
    const owned = visit("owned");
    const guest = visit("guest", true);

    persistVisits(storageKeyFor("account-a"), [owned]);
    persistVisits(storageKeyFor(null), [guest]);

    const originalRemove = Storage.prototype.removeItem;

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === storageKeyFor(null)) {
        throw new Error("Storage unavailable");
      }

      originalRemove.call(this, key);
    });

    expect(restoreVisits("account-a")).toEqual([owned]);
  });

  it("reports persistence failure without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(persistVisits(storageKeyFor("account-a"), [visit("job-a")])).toBe(
      false,
    );
  });

  it("removes storage when the visit list becomes empty", () => {
    const key = storageKeyFor("account-a");

    persistVisits(key, [visit("job-a")]);

    expect(persistVisits(key, [])).toBe(true);
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
