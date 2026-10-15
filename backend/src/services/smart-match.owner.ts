import { sql } from "drizzle-orm";
import { z } from "zod";

export function getOwnerClerkUserId(): string | null {
  const value = process.env.SMARTMATCH_OWNER_CLERK_USER_ID?.trim();

  if (!value || !/^user_[a-zA-Z0-9]+$/.test(value)) {
    return null;
  }

  return value;
}

export function isOwnerClerkUserId(clerkUserId: string): boolean {
  const ownerId = getOwnerClerkUserId();

  return ownerId !== null && clerkUserId === ownerId;
}

export async function hasSmartMatchAccess(
  verifiedClerkUserId: string,
): Promise<boolean> {
  if (isOwnerClerkUserId(verifiedClerkUserId)) {
    return true;
  }

  const { hasPremium } = await import("./billing.service.js");

  return hasPremium(verifiedClerkUserId);
}

export async function isOwnerDatabaseUserId(
  databaseUserId: string,
): Promise<boolean> {
  const ownerId = getOwnerClerkUserId();

  if (!ownerId) {
    return false;
  }

  const { db } = await import("../db/index.js");

  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM users
      WHERE id = ${databaseUserId}::uuid
        AND clerk_user_id = ${ownerId}
    ) AS is_owner
  `);

  const rows = z.array(z.object({ is_owner: z.boolean() })).parse(result.rows);

  return rows[0]?.is_owner === true;
}
