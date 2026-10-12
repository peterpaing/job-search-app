import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./schema.js";
import type { MatchProfile } from "../services/smart-match.logic.js";

export const smartMatchProfiles = pgTable("smart_match_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  profile: jsonb("profile").$type<MatchProfile>().notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "string",
  })
    .notNull()
    .defaultNow(),
});

export const smartMatchCache = pgTable(
  "smart_match_cache",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    key: text("key").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    index("smart_match_cache_expiry_idx").on(table.expiresAt),
  ],
);

export const smartMatchUsage = pgTable(
  "smart_match_usage",
  {
    scope: text("scope").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    requests: integer("requests").notNull().default(0),
    reservedCents: integer("reserved_cents").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.scope, table.day] })],
);

export const smartMatchLocks = pgTable("smart_match_locks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  leaseId: uuid("lease_id").notNull(),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
});
