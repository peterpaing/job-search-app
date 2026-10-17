import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  BillingBusyError,
  getBillingConfig,
  getStripe,
} from "./billing.config.js";
import {
  AccountDeletionError,
  accountDeletionEnabled,
  clerkIdentityHash,
} from "./account-deletion.state.js";
import { isShuttingDown, trackTask } from "../runtime.js";

type BillingCustomer = {
  userId: string;
  stripeCustomerId: string;
  livemode: boolean;
};

const customerSchema = z.object({
  userId: z.uuid(),
  stripeCustomerId: z.string().startsWith("cus_"),
  livemode: z.boolean(),
});

function stripeForDeletion(livemode: boolean): Stripe {
  const config = getBillingConfig();

  if (config.livemode === livemode) {
    return getStripe();
  }

  // Only needed if the same database user has billing records
  // in both Stripe environments.
  const key =
    process.env[
      livemode ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_TEST_SECRET_KEY"
    ]?.trim();

  const prefix = livemode ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;

  if (
    !key ||
    !prefix.test(key) ||
    (livemode &&
      (process.env.BILLING_LIVE_ENABLED !== "true" ||
        !config.frontendOrigin.startsWith("https://")))
  ) {
    throw new AccountDeletionError(
      503,
      "Account deletion needs billing configuration. Please contact support.",
    );
  }

  return new Stripe(key, {
    timeout: 10_000,
    maxNetworkRetries: 1,
  });
}

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }

  return null;
}

function verifyOwnership(
  object: { customer: unknown; livemode: boolean },
  customer: BillingCustomer,
) {
  if (
    objectId(object.customer) !== customer.stripeCustomerId ||
    object.livemode !== customer.livemode
  ) {
    throw new AccountDeletionError(
      503,
      "Billing ownership verification failed.",
    );
  }
}

async function collect<T>(
  source: AsyncIterable<T>,
  heartbeat: () => Promise<void>,
): Promise<T[]> {
  const records: T[] = [];

  for await (const record of source) {
    records.push(record);

    if (records.length > 500) {
      throw new AccountDeletionError(
        503,
        "This account needs a billing review before deletion can finish.",
      );
    }

    if (records.length % 50 === 0) {
      await heartbeat();
    }
  }

  return records;
}

async function customersForUser(userId: string): Promise<BillingCustomer[]> {
  const result = await db.execute(sql`
    SELECT
      user_id AS "userId",
      stripe_customer_id AS "stripeCustomerId",
      livemode
    FROM billing_customers
    WHERE user_id = ${userId}::uuid
    ORDER BY livemode, stripe_customer_id
  `);

  return z.array(customerSchema).parse(result.rows);
}

export async function stopAccountBillingForCustomer(
  customer: BillingCustomer,
  keepJobAlive: () => Promise<void> = async () => undefined,
) {
  const stripe = stripeForDeletion(customer.livemode);
  const owner = randomUUID();

  const claim = await db.execute(sql`
    SELECT account_deletion_take_billing_lock(
      ${customer.stripeCustomerId},
      ${owner}::uuid,
      true
    ) AS acquired
  `);

  if (claim.rows[0]?.acquired !== true) {
    throw new BillingBusyError();
  }

  async function heartbeat() {
    await keepJobAlive();

    const renewed = await db.execute(sql`
      UPDATE billing_customers
      SET sync_until = clock_timestamp() + interval '2 minutes'
      WHERE stripe_customer_id = ${customer.stripeCustomerId}
        AND sync_owner = ${owner}::uuid
        AND sync_until > clock_timestamp()
      RETURNING stripe_customer_id
    `);

    if (renewed.rows.length !== 1) {
      throw new BillingBusyError();
    }
  }

  try {
    await heartbeat();

    const stripeCustomer = await stripe.customers.retrieve(
      customer.stripeCustomerId,
    );

    if (stripeCustomer.id !== customer.stripeCustomerId) {
      throw new AccountDeletionError(503, "Billing verification failed.");
    }

    if (!stripeCustomer.deleted) {
      if (
        stripeCustomer.livemode !== customer.livemode ||
        stripeCustomer.metadata.stackwing_user_id !== customer.userId
      ) {
        throw new AccountDeletionError(
          503,
          "Billing ownership verification failed.",
        );
      }

      // Expire every open checkout, not only the latest saved session.
      await heartbeat();

      const sessions = await collect(
        stripe.checkout.sessions.list({
          customer: customer.stripeCustomerId,
          status: "open",
          limit: 100,
        }),
        heartbeat,
      );

      for (const session of sessions) {
        verifyOwnership(session, customer);
        await heartbeat();

        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch (error) {
          // Checkout may have completed while expiration was requested.
          // Do not ignore the failure unless Stripe confirms it is closed.
          const current = await stripe.checkout.sessions.retrieve(session.id);
          verifyOwnership(current, customer);

          if (current.status !== "complete" && current.status !== "expired") {
            throw error;
          }
        }
      }

      // Stop scheduled subscriptions as well as ordinary subscriptions.
      await heartbeat();

      const schedules = await collect(
        stripe.subscriptionSchedules.list({
          customer: customer.stripeCustomerId,
          limit: 100,
        }),
        heartbeat,
      );

      for (const schedule of schedules) {
        verifyOwnership(schedule, customer);

        if (schedule.status === "active" || schedule.status === "not_started") {
          await heartbeat();

          const canceled = await stripe.subscriptionSchedules.cancel(
            schedule.id,
            {
              invoice_now: false,
              prorate: false,
            },
          );

          if (canceled.status !== "canceled") {
            throw new AccountDeletionError(
              503,
              "Subscription cancellation needs a retry.",
            );
          }
        }
      }

      await heartbeat();

      const subscriptions = await collect(
        stripe.subscriptions.list({
          customer: customer.stripeCustomerId,
          status: "all",
          limit: 100,
        }),
        heartbeat,
      );

      for (const subscription of subscriptions) {
        verifyOwnership(subscription, customer);

        if (
          subscription.status === "canceled" ||
          subscription.status === "incomplete_expired"
        ) {
          continue;
        }

        await heartbeat();

        const canceled = await stripe.subscriptions.cancel(subscription.id, {
          invoice_now: false,
          prorate: false,
        });

        verifyOwnership(canceled, customer);

        if (canceled.status !== "canceled") {
          throw new AccountDeletionError(
            503,
            "Subscription cancellation needs a retry.",
          );
        }
      }

      // Disable automatic processing of outstanding invoices.
      // Payments already in progress are not reversed or refunded.
      for (const status of ["draft", "open"] as const) {
        await heartbeat();

        const invoices = await collect(
          stripe.invoices.list({
            customer: customer.stripeCustomerId,
            status,
            limit: 100,
          }),
          heartbeat,
        );

        for (const invoice of invoices) {
          verifyOwnership(invoice, customer);

          if (invoice.auto_advance) {
            await heartbeat();

            const updated = await stripe.invoices.update(invoice.id, {
              auto_advance: false,
            });

            if (updated.auto_advance) {
              throw new AccountDeletionError(
                503,
                "Invoice processing needs a billing review.",
              );
            }
          }
        }
      }

      // Verify the final provider state before confirming shutdown.
      await heartbeat();

      const openSessions = await stripe.checkout.sessions.list({
        customer: customer.stripeCustomerId,
        status: "open",
        limit: 1,
      });

      if (openSessions.data.length > 0) {
        throw new AccountDeletionError(
          503,
          "Checkout expiration needs a retry.",
        );
      }

      await heartbeat();

      const remainingSchedules = await collect(
        stripe.subscriptionSchedules.list({
          customer: customer.stripeCustomerId,
          limit: 100,
        }),
        heartbeat,
      );

      for (const schedule of remainingSchedules) {
        verifyOwnership(schedule, customer);

        if (schedule.status === "active" || schedule.status === "not_started") {
          throw new AccountDeletionError(
            503,
            "Scheduled billing cancellation needs a retry.",
          );
        }
      }

      await heartbeat();

      const remainingSubscriptions = await collect(
        stripe.subscriptions.list({
          customer: customer.stripeCustomerId,
          status: "all",
          limit: 100,
        }),
        heartbeat,
      );

      for (const subscription of remainingSubscriptions) {
        verifyOwnership(subscription, customer);

        if (
          subscription.status !== "canceled" &&
          subscription.status !== "incomplete_expired"
        ) {
          throw new AccountDeletionError(
            503,
            "Subscription cancellation needs a retry.",
          );
        }
      }
    }

    await heartbeat();

    const updated = await db.execute(sql`
      UPDATE billing_customers
      SET risk_hold = true,
          checkout_key = NULL,
          checkout_expires_at = NULL,
          checkout_session_id = NULL
      WHERE stripe_customer_id = ${customer.stripeCustomerId}
        AND sync_owner = ${owner}::uuid
        AND sync_until > clock_timestamp()
      RETURNING stripe_customer_id
    `);

    if (updated.rows.length !== 1) {
      throw new BillingBusyError();
    }

    await db.execute(sql`
      UPDATE billing_subscriptions
      SET premium = false,
          updated_at = clock_timestamp()
      WHERE stripe_customer_id = ${customer.stripeCustomerId}
    `);
  } finally {
    await db.execute(sql`
      UPDATE billing_customers
      SET sync_owner = NULL,
          sync_until = NULL
      WHERE stripe_customer_id = ${customer.stripeCustomerId}
        AND sync_owner = ${owner}::uuid
    `);
  }
}

export async function processAccountDeletion(userId: string): Promise<void> {
  return trackTask(() => processAccountDeletionInternal(userId));
}

async function processAccountDeletionInternal(userId: string) {
  const owner = randomUUID();

  const claimed = await db.execute(sql`
    UPDATE account_deletions
    SET lease_owner = ${owner}::uuid,
        lease_until = clock_timestamp() + interval '10 minutes',
        attempts = attempts + 1
    WHERE user_id = ${userId}::uuid
      AND completed_at IS NULL
      AND next_attempt_at <= clock_timestamp()
      AND (
        lease_until IS NULL
        OR lease_until <= clock_timestamp()
      )
    RETURNING
      clerk_user_id,
      clerk_deleted_at IS NOT NULL AS clerk_deleted
  `);

  if (claimed.rows.length === 0) return;

  const job = z
    .object({
      clerk_user_id: z.string(),
      clerk_deleted: z.boolean(),
    })
    .parse(claimed.rows[0]);

  let stage = "billing";

  async function heartbeat() {
    const renewed = await db.execute(sql`
      UPDATE account_deletions
      SET lease_until = clock_timestamp() + interval '10 minutes'
      WHERE user_id = ${userId}::uuid
        AND lease_owner = ${owner}::uuid
        AND lease_until > clock_timestamp()
        AND completed_at IS NULL
      RETURNING user_id
    `);

    if (renewed.rows.length !== 1) {
      throw new AccountDeletionError(409, "Deletion processing needs a retry.");
    }
  }

  async function saveMilestone(kind: "billing" | "clerk") {
    await heartbeat();

    const saved = await db.execute(sql`
      UPDATE account_deletions
      SET
        billing_stopped_at = CASE
          WHEN ${kind === "billing"}
          THEN COALESCE(billing_stopped_at, clock_timestamp())
          ELSE billing_stopped_at
        END,
        clerk_deleted_at = CASE
          WHEN ${kind === "clerk"}
          THEN COALESCE(clerk_deleted_at, clock_timestamp())
          ELSE clerk_deleted_at
        END
      WHERE user_id = ${userId}::uuid
        AND lease_owner = ${owner}::uuid
        AND lease_until > clock_timestamp()
        AND completed_at IS NULL
      RETURNING user_id
    `);

    if (saved.rows.length !== 1) {
      throw new AccountDeletionError(409, "Deletion processing needs a retry.");
    }
  }

  try {
    // Recheck billing on every attempt, including after a partial failure.
    const customers = await customersForUser(userId);

    for (const customer of customers) {
      await stopAccountBillingForCustomer(customer, heartbeat);
    }

    await saveMilestone("billing");

    stage = "clerk";
    await heartbeat();

    if (!job.clerk_deleted) {
      try {
        await clerkClient.users.deleteUser(job.clerk_user_id);
      } catch (error) {
        // The previous attempt may have deleted Clerk successfully
        // before the database milestone could be saved.
        if (!isClerkAPIResponseError(error) || error.status !== 404) {
          throw error;
        }
      }

      await saveMilestone("clerk");
    }

    stage = "database";
    await heartbeat();

    const finished = await db.execute(sql`
      SELECT account_deletion_finish(
        ${userId}::uuid,
        ${owner}::uuid
      ) AS finished
    `);

    if (finished.rows[0]?.finished !== true) {
      throw new AccountDeletionError(409, "Deletion processing needs a retry.");
    }
  } catch {
    console.error("[account-deletion] Cleanup needs a retry.", {
      userId,
      stage,
    });

    try {
      await db.execute(sql`
        UPDATE account_deletions
        SET lease_owner = NULL,
            lease_until = NULL,
            next_attempt_at =
              clock_timestamp()
              + interval '30 seconds' * LEAST(attempts, 30),
            last_error = ${stage}
        WHERE user_id = ${userId}::uuid
          AND lease_owner = ${owner}::uuid
          AND completed_at IS NULL
      `);
    } catch {
      // The durable job remains. Its lease expires after a crash
      // or database failure, allowing a later worker to recover it.
      console.error("[account-deletion] Could not save retry state.");
    }
  }
}

export async function requestAccountDeletion(clerkUserId: string) {
  if (!accountDeletionEnabled()) {
    throw new AccountDeletionError(
      503,
      "Account deletion is temporarily unavailable.",
    );
  }

  const existing = await db.execute(sql`
    SELECT
      user_id,
      completed_at IS NOT NULL AS completed
    FROM account_deletions
    WHERE clerk_user_id_hash = ${clerkIdentityHash(clerkUserId)}
  `);

  if (existing.rows[0]) {
    const row = z
      .object({
        user_id: z.uuid(),
        completed: z.boolean(),
      })
      .parse(existing.rows[0]);

    if (!row.completed) {
      void processAccountDeletion(row.user_id).catch(() => {
        console.error(
          "[account-deletion] Worker will retry the saved request.",
        );
      });
    }

    return {
      status: row.completed ? "completed" : "pending",
    };
  }

  // Confirm the identity belongs to this Clerk instance.
  const clerkUser = await clerkClient.users.getUser(clerkUserId);

  if (clerkUser.id !== clerkUserId) {
    throw new AccountDeletionError(403, "Account verification failed.");
  }

  // Prevent direct frontend deletion from bypassing billing cleanup.
  if (clerkUser.deleteSelfEnabled) {
    await clerkClient.users.updateUser(clerkUserId, {
      deleteSelfEnabled: false,
    });
  }

  const mapped = await db.execute(sql`
    SELECT
      c.user_id AS "userId",
      c.stripe_customer_id AS "stripeCustomerId",
      c.livemode
    FROM billing_customers c
    JOIN users u ON u.id = c.user_id
    WHERE u.clerk_user_id = ${clerkUserId}
  `);

  // Fail before accepting deletion if a billing environment
  // has no correctly configured Stripe client.
  for (const customer of z.array(customerSchema).parse(mapped.rows)) {
    stripeForDeletion(customer.livemode);
  }

  const response = await db.execute(sql`
    SELECT account_deletion_begin(${clerkUserId}) AS result
  `);

  const result = z
    .object({
      status: z.enum(["busy", "pending", "completed"]),
      userId: z.uuid(),
    })
    .parse(response.rows[0]?.result);

  if (result.status === "busy") {
    throw new AccountDeletionError(
      409,
      "An AI or billing request is still running. Wait for it to finish, then try again.",
    );
  }

  if (result.status === "pending") {
    void processAccountDeletion(result.userId).catch(() => {
      console.error("[account-deletion] Worker will retry the saved request.");
    });
  }

  return { status: result.status };
}

export async function processPendingAccountDeletions() {
  const pending = await db.execute(sql`
    SELECT user_id
    FROM account_deletions
    WHERE completed_at IS NULL
      AND next_attempt_at <= clock_timestamp()
      AND (
        lease_until IS NULL
        OR lease_until <= clock_timestamp()
      )
    ORDER BY next_attempt_at, requested_at
    LIMIT 5
  `);

  const jobs = z.array(z.object({ user_id: z.uuid() })).parse(pending.rows);

  for (const job of jobs) {
    if (isShuttingDown()) {
      break;
    }

    await processAccountDeletion(job.user_id);
  }
}
