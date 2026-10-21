import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOwnedSessionToken } from "../../app/lib/owned-session-token";

type TestIdentity = {
  user: { id: string } | null;
  session: {
    id: string;
    getToken: () => Promise<string | null>;
  } | null;
};

const getToken = vi.fn<() => Promise<string | null>>();

let clerk: TestIdentity;

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

beforeEach(() => {
  getToken.mockReset();
  getToken.mockResolvedValue("owned-token");

  clerk = {
    user: { id: "user-a" },
    session: {
      id: "session-a",
      getToken,
    },
  };
});

describe("owned session tokens", () => {
  it("returns a token for the intended user and session", async () => {
    await expect(
      readOwnedSessionToken(clerk, "user-a", "session-a"),
    ).resolves.toBe("owned-token");

    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("does not read a different user's token", async () => {
    await expect(
      readOwnedSessionToken(clerk, "user-b", "session-a"),
    ).resolves.toBeNull();

    expect(getToken).not.toHaveBeenCalled();
  });

  it("does not read a different session's token", async () => {
    await expect(
      readOwnedSessionToken(clerk, "user-a", "session-b"),
    ).resolves.toBeNull();

    expect(getToken).not.toHaveBeenCalled();
  });

  it("does not read a token without a complete identity", async () => {
    await expect(
      readOwnedSessionToken(clerk, null, "session-a"),
    ).resolves.toBeNull();

    clerk.session = null;

    await expect(
      readOwnedSessionToken(clerk, "user-a", "session-a"),
    ).resolves.toBeNull();

    expect(getToken).not.toHaveBeenCalled();
  });

  it("discards a token when the account changes during retrieval", async () => {
    const pending = deferred<string | null>();
    getToken.mockReturnValueOnce(pending.promise);

    const result = readOwnedSessionToken(clerk, "user-a", "session-a");

    clerk.user = { id: "user-b" };
    clerk.session = {
      id: "session-b",
      getToken,
    };

    pending.resolve("old-account-token");

    await expect(result).resolves.toBeNull();
  });

  it("discards a token when only the session changes", async () => {
    const pending = deferred<string | null>();
    getToken.mockReturnValueOnce(pending.promise);

    const result = readOwnedSessionToken(clerk, "user-a", "session-a");

    clerk.session = {
      id: "session-replacement",
      getToken,
    };

    pending.resolve("old-session-token");

    await expect(result).resolves.toBeNull();
  });

  it("discards a token if the user signs out during retrieval", async () => {
    const pending = deferred<string | null>();
    getToken.mockReturnValueOnce(pending.promise);

    const result = readOwnedSessionToken(clerk, "user-a", "session-a");

    clerk.user = null;
    clerk.session = null;

    pending.resolve("old-token");

    await expect(result).resolves.toBeNull();
  });

  it("preserves the captured session method's receiver", async () => {
    clerk.session = {
      id: "session-a",
      async getToken() {
        return `token:${this.id}`;
      },
    };

    await expect(
      readOwnedSessionToken(clerk, "user-a", "session-a"),
    ).resolves.toBe("token:session-a");
  });

  it("returns null when Clerk cannot provide a token", async () => {
    getToken.mockResolvedValueOnce(null);

    await expect(
      readOwnedSessionToken(clerk, "user-a", "session-a"),
    ).resolves.toBeNull();
  });

  it("propagates token retrieval failures", async () => {
    const failure = new Error("Token unavailable");
    getToken.mockRejectedValueOnce(failure);

    await expect(
      readOwnedSessionToken(clerk, "user-a", "session-a"),
    ).rejects.toBe(failure);
  });
});
