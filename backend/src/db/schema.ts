import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  pgEnum,
  uniqueIndex,
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

    index("jobs_active_title_trgm_idx")
      .using("gin", table.title.op("gin_trgm_ops"))
      .where(sql`${table.isActive} = true`),

    index("jobs_active_company_trgm_idx")
      .using("gin", table.company.op("gin_trgm_ops"))
      .where(sql`${table.isActive} = true`),

    index("jobs_active_location_trgm_idx")
      .using("gin", table.location.op("gin_trgm_ops"))
      .where(sql`${table.isActive} = true`),

    index("jobs_active_country_trgm_idx")
      .using("gin", table.country.op("gin_trgm_ops"))
      .where(sql`${table.isActive} = true`),

    index("jobs_active_tags_trgm_idx")
      .using(
        "gin",
        sql`public.stackwing_job_tag_text(${table.tags}) gin_trgm_ops`,
      )
      .where(sql`${table.isActive} = true`),

    index("jobs_active_listing_order_idx")
      .on(
        sql`(CASE ${table.source}
          WHEN 'Himalayas' THEN 1
          WHEN 'Dev Global Jobs' THEN 2
          WHEN 'We Work Remotely' THEN 3
          WHEN 'Remote OK' THEN 4
          ELSE 5
        END)`,
        table.postedAt.desc(),
        table.id.asc(),
      )
      .where(sql`${table.isActive} = true`),
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

export const applicationStatus = pgEnum("application_status", [
  "applied",
  "interviewing",
  "offered",
  "rejected",
]);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Intentionally not a foreign key to jobs.
    // Job cleanup must not remove application history.
    jobId: text("job_id").notNull(),

    // Snapshot the original listing using trusted database values.
    title: text("title").notNull(),
    company: text("company").notNull(),
    url: text("url").notNull(),

    status: applicationStatus("status").notNull().default("applied"),
    notes: text("notes").notNull().default(""),

    appliedAt: timestamp("applied_at", {
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
    uniqueIndex("applications_user_job_unique").on(table.userId, table.jobId),
    index("applications_user_applied_at_idx").on(table.userId, table.appliedAt),
  ],
);

export type DatabaseApplication = typeof applications.$inferSelect;
export type DatabaseJob = typeof jobs.$inferSelect;
export type NewDatabaseJob = typeof jobs.$inferInsert;
export type DatabaseUser = typeof users.$inferSelect;
