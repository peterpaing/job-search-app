import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const jobs = pgTable(
  "jobs",
  {
    // Keep existing source-prefixed IDs, such as "remote-ok-123".
    id: text("id").primaryKey(),

    source: text("source").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    companyLogo: text("company_logo"),
    description: text("description"),
    location: text("location"),
    country: text("country"),

    tags: text("tags").array().notNull().default([]),

    url: text("url").notNull(),

    postedAt: timestamp("posted_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),

    isActive: boolean("is_active").notNull().default(true),

    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("jobs_source_idx").on(table.source),
    index("jobs_posted_at_idx").on(table.postedAt),
  ],
);

export type DatabaseJob = typeof jobs.$inferSelect;
export type NewDatabaseJob = typeof jobs.$inferInsert;
