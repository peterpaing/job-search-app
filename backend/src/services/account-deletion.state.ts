import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";

export class AccountDeletionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

export function accountDeletionEnabled() {
  return (
    process.env.ACCOUNT_DELETION_ENABLED === "true" &&
    process.env.ACCOUNT_DELETION_WORKER_ENABLED === "true"
  );
}

export function clerkIdentityHash(clerkUserId: string) {
  return createHash("sha256").update(clerkUserId, "utf8").digest("hex");
}

const requestedSchema = z.object({
  requested: z.boolean(),
});

export async function assertAccountActive(clerkUserId: string) {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM account_deletions
      WHERE clerk_user_id_hash = ${clerkIdentityHash(clerkUserId)}
    ) AS requested
  `);

  if (requestedSchema.parse(result.rows[0]).requested) {
    throw new AccountDeletionError(
      410,
      "Account deletion has been requested. This account can no longer use private app features.",
    );
  }
}

export async function isUserDeletionRequested(userId: string) {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM account_deletions
      WHERE user_id = ${userId}::uuid
    ) AS requested
  `);

  return requestedSchema.parse(result.rows[0]).requested;
}
