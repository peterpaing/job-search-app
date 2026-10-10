import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, type DatabaseUser } from "../db/schema.js";

export async function getOrCreateUser(
  clerkUserId: string,
): Promise<DatabaseUser> {
  if (!clerkUserId.trim()) {
    throw new Error("Clerk user ID is required");
  }

  const [createdUser] = await db
    .insert(users)
    .values({ clerkUserId })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();

  if (createdUser) {
    return createdUser;
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!existingUser) {
    throw new Error("Unable to find the account record");
  }

  return existingUser;
}
