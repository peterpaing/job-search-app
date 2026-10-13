import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, type DatabaseUser } from "../db/schema.js";

// Share only pending lookups, never completed account or permission state.
const pendingUsers = new Map<string, Promise<DatabaseUser>>();

export async function getOrCreateUser(
  clerkUserId: string,
): Promise<DatabaseUser> {
  if (!clerkUserId.trim()) {
    throw new Error("Clerk user ID is required");
  }

  const existingRequest = pendingUsers.get(clerkUserId);
  if (existingRequest) return existingRequest;
  const request = resolveUser(clerkUserId);
  pendingUsers.set(clerkUserId, request);
  try {
    return await request;
  } finally {
    if (pendingUsers.get(clerkUserId) === request)
      pendingUsers.delete(clerkUserId);
  }
}

async function resolveUser(clerkUserId: string): Promise<DatabaseUser> {
  // Returning users need a read, not a conflicting insert on every request.
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (existingUser) {
    return existingUser;
  }

  const [createdUser] = await db
    .insert(users)
    .values({ clerkUserId })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();

  if (createdUser) {
    return createdUser;
  }

  // Another request may have created the account after our first read.
  const [concurrentUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!concurrentUser) {
    throw new Error("Unable to find the account record");
  }

  return concurrentUser;
}
