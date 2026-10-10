import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  clerkUserId: text("clerk_user_id").notNull().unique(),

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
});

export const savedJobs = pgTable(
  "saved_jobs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    savedAt: timestamp("saved_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.jobId],
    }),
    index("saved_jobs_job_id_idx").on(table.jobId),
    index("saved_jobs_user_saved_at_idx").on(table.userId, table.savedAt),
  ],
);

export type DatabaseJob = typeof jobs.$inferSelect;
export type NewDatabaseJob = typeof jobs.$inferInsert;
export type DatabaseUser = typeof users.$inferSelect;
