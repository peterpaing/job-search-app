import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { getOrCreateUser } from "../../services/users.service.js";

const testClerkIds = new Set<string>();

function createTestClerkId() {
  const clerkUserId = `user_integration_${randomUUID()}`;

  testClerkIds.add(clerkUserId);

  return clerkUserId;
}

async function findUsers(clerkUserId: string) {
  return db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
}

describe("users database integration", () => {
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;

    if (!testUrl || process.env.DATABASE_URL !== testUrl) {
      throw new Error(
        "Use the integration configuration with a separate TEST_DATABASE_URL",
      );
    }

    // Confirm the users migration has been applied.
    await db.select({ id: users.id }).from(users).limit(1);
  });

  afterEach(async () => {
    const ids = [...testClerkIds];

    try {
      if (ids.length > 0) {
        await db.delete(users).where(inArray(users.clerkUserId, ids));
      }
    } finally {
      testClerkIds.clear();
    }
  });

  it("creates a user with an ID and timestamps", async () => {
    const clerkUserId = createTestClerkId();

    const user = await getOrCreateUser(clerkUserId);

    expect(user.clerkUserId).toBe(clerkUserId);

    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    expect(Number.isFinite(Date.parse(user.createdAt))).toBe(true);
    expect(Number.isFinite(Date.parse(user.updatedAt))).toBe(true);

    const rows = await findUsers(clerkUserId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(user);
  });

  it("returns the same record on repeated calls", async () => {
    const clerkUserId = createTestClerkId();

    const first = await getOrCreateUser(clerkUserId);
    const second = await getOrCreateUser(clerkUserId);

    expect(second).toEqual(first);
    expect(await findUsers(clerkUserId)).toHaveLength(1);
  });

  it("creates separate records for different Clerk users", async () => {
    const firstClerkId = createTestClerkId();
    const secondClerkId = createTestClerkId();

    const first = await getOrCreateUser(firstClerkId);
    const second = await getOrCreateUser(secondClerkId);

    expect(first.id).not.toBe(second.id);
    expect(first.clerkUserId).toBe(firstClerkId);
    expect(second.clerkUserId).toBe(secondClerkId);

    expect(await findUsers(firstClerkId)).toHaveLength(1);
    expect(await findUsers(secondClerkId)).toHaveLength(1);
  });

  it("creates only one record during simultaneous requests", async () => {
    const clerkUserId = createTestClerkId();

    // Wait for every request before assertions and cleanup.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => getOrCreateUser(clerkUserId)),
    );

    const returnedIds: string[] = [];

    for (const result of results) {
      expect(result.status).toBe("fulfilled");

      if (result.status === "fulfilled") {
        returnedIds.push(result.value.id);
      }
    }

    expect(returnedIds).toHaveLength(5);
    expect(new Set(returnedIds).size).toBe(1);

    const rows = await findUsers(clerkUserId);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(returnedIds[0]);
  });
});
