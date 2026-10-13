import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./schema.js";

const dateColumn = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const billingCustomers = pgTable(
  "billing_customers",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    livemode: boolean("livemode").notNull(),

    stripeCustomerId: text("stripe_customer_id").notNull().unique(),

    checkoutKey: uuid("checkout_key"),
    checkoutExpiresAt: dateColumn("checkout_expires_at"),
    checkoutSessionId: text("checkout_session_id"),
    consentAt: dateColumn("consent_at"),

    syncOwner: uuid("sync_owner"),
    syncUntil: dateColumn("sync_until"),
    syncedAt: dateColumn("synced_at"),

    riskHold: boolean("risk_hold").notNull().default(false),

    createdAt: dateColumn("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.livemode] })],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    stripeSubscriptionId: text("stripe_subscription_id").primaryKey(),

    stripeCustomerId: text("stripe_customer_id")
      .notNull()
      .references(() => billingCustomers.stripeCustomerId, {
        onDelete: "restrict",
      }),

    priceId: text("price_id").notNull(),
    status: text("status").notNull(),

    premium: boolean("premium").notNull().default(false),
    paidUntil: dateColumn("paid_until"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),

    updatedAt: dateColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("billing_subscriptions_customer_idx").on(table.stripeCustomerId),
  ],
);

export const billingEvents = pgTable("billing_events", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  livemode: boolean("livemode").notNull(),
  processedAt: dateColumn("processed_at").notNull().defaultNow(),
});
