import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "../../db/schema.js";
import { getOrCreateUser } from "../../services/users.service.js";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
  },
}));

const storedUser = {
  id: "a4c4cf3d-9584-4b14-8a2f-16e0faab7764",
  clerkUserId: "user_test",
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

describe("getOrCreateUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.insert.mockReturnValue({
      values: mocks.values,
    });

    mocks.values.mockReturnValue({
      onConflictDoNothing: mocks.onConflictDoNothing,
    });

    mocks.onConflictDoNothing.mockReturnValue({
      returning: mocks.returning,
    });

    mocks.select.mockReturnValue({
      from: mocks.from,
    });

    mocks.from.mockReturnValue({
      where: mocks.where,
    });

    mocks.where.mockReturnValue({
      limit: mocks.limit,
    });

    mocks.returning.mockResolvedValue([storedUser]);
    mocks.limit.mockResolvedValue([storedUser]);
  });

  it("creates and returns a new user", async () => {
    await expect(getOrCreateUser("user_test")).resolves.toEqual(storedUser);

    expect(mocks.insert).toHaveBeenCalledWith(users);

    expect(mocks.values).toHaveBeenCalledWith({
      clerkUserId: "user_test",
    });

    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("uses the unique Clerk ID to handle duplicate inserts", async () => {
    await getOrCreateUser("user_test");

    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: users.clerkUserId,
    });
  });

  it("returns the existing user after an insert conflict", async () => {
    mocks.returning.mockResolvedValue([]);

    await expect(getOrCreateUser("user_test")).resolves.toEqual(storedUser);

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith(users);
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });

  it("looks up the exact Clerk ID using a parameterized query", async () => {
    mocks.returning.mockResolvedValue([]);

    await getOrCreateUser("user_test");

    const condition = mocks.where.mock.calls[0][0] as SQL;
    const query = new PgDialect().sqlToQuery(condition);

    expect(query.sql).toBe('"users"."clerk_user_id" = $1');
    expect(query.params).toEqual(["user_test"]);
  });

  it.each(["", " ", "\n\t"])(
    "rejects an empty Clerk ID: %j",
    async (clerkUserId) => {
      await expect(getOrCreateUser(clerkUserId)).rejects.toThrow(
        "Clerk user ID is required",
      );

      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
    },
  );

  it("throws if the conflicting record cannot be found", async () => {
    mocks.returning.mockResolvedValue([]);
    mocks.limit.mockResolvedValue([]);

    await expect(getOrCreateUser("user_test")).rejects.toThrow(
      "Unable to find the account record",
    );
  });

  it("propagates insert errors", async () => {
    mocks.returning.mockRejectedValue(new Error("Insert failed"));

    await expect(getOrCreateUser("user_test")).rejects.toThrow("Insert failed");

    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("propagates lookup errors", async () => {
    mocks.returning.mockResolvedValue([]);
    mocks.limit.mockRejectedValue(new Error("Lookup failed"));

    await expect(getOrCreateUser("user_test")).rejects.toThrow("Lookup failed");
  });
});
