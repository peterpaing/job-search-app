import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as runtime from "../../runtime.js";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  config: vi.fn(),
  getStripe: vi.fn(),
  customerRetrieve: vi.fn(),
  checkoutList: vi.fn(),
  checkoutExpire: vi.fn(),
  checkoutRetrieve: vi.fn(),
  scheduleList: vi.fn(),
  scheduleCancel: vi.fn(),
  subscriptionList: vi.fn(),
  subscriptionCancel: vi.fn(),
  invoiceList: vi.fn(),
  invoiceUpdate: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: { execute: mocks.execute },
}));

vi.mock("@clerk/express", () => ({
  clerkClient: {
    users: {
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      deleteUser: mocks.deleteUser,
    },
  },
}));

vi.mock("@clerk/backend/errors", () => ({
  isClerkAPIResponseError: (error: unknown) =>
    error instanceof Error && "clerk" in error && error.clerk === true,
}));

// No alternate Stripe client may accidentally make real requests.
vi.mock("stripe", () => ({
  default: class {
    constructor() {
      throw new Error("Unexpected real Stripe client construction");
    }
  },
}));

vi.mock("../../services/billing.config.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/billing.config.js")>();

  return {
    ...actual,
    getBillingConfig: mocks.config,
    getStripe: mocks.getStripe,
  };
});

import {
  processAccountDeletion,
  processPendingAccountDeletions,
  requestAccountDeletion,
  stopAccountBillingForCustomer,
} from "../../services/account-deletion.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const clerkId = "user_deletion_test";
const customerId = "cus_deletion_test";

const customer = {
  userId,
  stripeCustomerId: customerId,
  livemode: false,
};

type ProviderRecord = {
  id: string;
  customer: string;
  livemode: boolean;
  status: string;
  auto_advance?: boolean;
};

type Existing = {
  user_id: string;
  completed: boolean;
};

type Claim = {
  clerk_user_id: string;
  clerk_deleted: boolean;
};

let existing: Existing | null;
let mapped: (typeof customer)[];
let customers: (typeof customer)[];
let claims: Claim[];
let pending: { user_id: string }[];
let beginStatus: "busy" | "pending" | "completed";
let billingLockAvailable: boolean;
let heartbeatAvailable: boolean;
let finishAvailable: boolean;
let events: string[];

let sessions: ProviderRecord[];
let schedules: ProviderRecord[];
let subscriptions: ProviderRecord[];
let invoices: ProviderRecord[];

const dialect = new PgDialect();

function page<T>(data: T[]) {
  return {
    data,
    async *[Symbol.asyncIterator]() {
      yield* data;
    },
  };
}

function record(id: string, status: string): ProviderRecord {
  return {
    id,
    status,
    customer: customerId,
    livemode: false,
  };
}

function ownedRecord(records: ProviderRecord[], id: string) {
  const value = records.find((item) => item.id === id);

  if (!value) {
    throw new Error(`Unknown mocked object: ${id}`);
  }

  return value;
}

function enableClaim(clerkDeleted = false) {
  claims = [
    {
      clerk_user_id: clerkId,
      clerk_deleted: clerkDeleted,
    },
  ];
}

describe("account deletion service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "true");
    vi.stubEnv("ACCOUNT_DELETION_WORKER_ENABLED", "true");
    vi.stubEnv("STRIPE_LIVE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_TEST_SECRET_KEY", "");
    vi.stubEnv("BILLING_LIVE_ENABLED", "false");

    vi.spyOn(console, "error").mockImplementation(() => undefined);

    existing = null;
    mapped = [];
    customers = [];
    claims = [];
    pending = [];
    beginStatus = "pending";
    billingLockAvailable = true;
    heartbeatAvailable = true;
    finishAvailable = true;
    events = [];

    sessions = [];
    schedules = [];
    subscriptions = [];
    invoices = [];

    mocks.getUser.mockResolvedValue({
      id: clerkId,
      deleteSelfEnabled: false,
    });
    mocks.updateUser.mockResolvedValue({});
    mocks.deleteUser.mockImplementation(async () => {
      events.push("clerk deleted");
    });

    mocks.config.mockReturnValue({
      livemode: false,
      frontendOrigin: "http://localhost:3000",
    });

    mocks.getStripe.mockReturnValue({
      customers: { retrieve: mocks.customerRetrieve },
      checkout: {
        sessions: {
          list: mocks.checkoutList,
          expire: mocks.checkoutExpire,
          retrieve: mocks.checkoutRetrieve,
        },
      },
      subscriptionSchedules: {
        list: mocks.scheduleList,
        cancel: mocks.scheduleCancel,
      },
      subscriptions: {
        list: mocks.subscriptionList,
        cancel: mocks.subscriptionCancel,
      },
      invoices: {
        list: mocks.invoiceList,
        update: mocks.invoiceUpdate,
      },
    });

    mocks.customerRetrieve.mockResolvedValue({
      id: customerId,
      deleted: false,
      livemode: false,
      metadata: { stackwing_user_id: userId },
    });

    mocks.checkoutList.mockImplementation(() =>
      page(sessions.filter((item) => item.status === "open")),
    );
    mocks.checkoutExpire.mockImplementation(async (id: string) => {
      const item = ownedRecord(sessions, id);
      item.status = "expired";
      return item;
    });
    mocks.checkoutRetrieve.mockImplementation(async (id: string) =>
      ownedRecord(sessions, id),
    );

    mocks.scheduleList.mockImplementation(() => page(schedules));
    mocks.scheduleCancel.mockImplementation(async (id: string) => {
      const item = ownedRecord(schedules, id);
      item.status = "canceled";
      events.push("schedule canceled");
      return item;
    });

    mocks.subscriptionList.mockImplementation(() => page(subscriptions));
    mocks.subscriptionCancel.mockImplementation(async (id: string) => {
      const item = ownedRecord(subscriptions, id);
      item.status = "canceled";
      events.push("subscription canceled");
      return item;
    });

    mocks.invoiceList.mockImplementation(({ status }: { status: string }) =>
      page(invoices.filter((item) => item.status === status)),
    );
    mocks.invoiceUpdate.mockImplementation(async (id: string) => {
      const item = ownedRecord(invoices, id);
      item.auto_advance = false;
      return item;
    });

    mocks.execute.mockImplementation(async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      const text = compiled.sql.replace(/\s+/g, " ").trim();

      if (
        text.includes("FROM account_deletions") &&
        text.includes("clerk_user_id_hash")
      ) {
        return { rows: existing ? [existing] : [] };
      }

      if (
        text.includes("FROM billing_customers c") &&
        text.includes("JOIN users")
      ) {
        return { rows: mapped };
      }

      if (text.includes("SELECT account_deletion_begin(")) {
        events.push("begin");
        return {
          rows: [{ result: { status: beginStatus, userId } }],
        };
      }

      if (
        text.startsWith("UPDATE account_deletions SET lease_owner =") &&
        text.includes("attempts = attempts + 1")
      ) {
        const rows = claims;
        claims = [];
        return { rows };
      }

      if (
        text.includes("FROM billing_customers") &&
        text.includes('AS "userId"')
      ) {
        return { rows: customers };
      }

      if (text.includes("SELECT account_deletion_take_billing_lock(")) {
        return { rows: [{ acquired: billingLockAvailable }] };
      }

      if (text.startsWith("UPDATE billing_customers SET sync_until =")) {
        return {
          rows: heartbeatAvailable ? [{ stripe_customer_id: customerId }] : [],
        };
      }

      if (text.startsWith("UPDATE billing_customers SET risk_hold =")) {
        events.push("billing access blocked");
        return { rows: [{ stripe_customer_id: customerId }] };
      }

      if (text.startsWith("UPDATE billing_customers SET sync_owner = NULL")) {
        events.push("billing lock released");
        return { rows: [] };
      }

      if (text.startsWith("UPDATE billing_subscriptions")) {
        events.push("premium disabled");
        return { rows: [] };
      }

      if (text.startsWith("UPDATE account_deletions SET lease_until =")) {
        return {
          rows: heartbeatAvailable ? [{ user_id: userId }] : [],
        };
      }

      if (
        text.startsWith(
          "UPDATE account_deletions SET billing_stopped_at = CASE",
        )
      ) {
        events.push(
          compiled.params[0] ? "billing milestone" : "clerk milestone",
        );
        return { rows: [{ user_id: userId }] };
      }

      if (text.includes("SELECT account_deletion_finish(")) {
        events.push("finish");
        return { rows: [{ finished: finishAvailable }] };
      }

      if (text.startsWith("UPDATE account_deletions SET lease_owner = NULL")) {
        events.push(`retry:${String(compiled.params[0])}`);
        return { rows: [] };
      }

      if (text.startsWith("SELECT user_id FROM account_deletions")) {
        return { rows: pending };
      }

      throw new Error(`Unexpected mocked SQL: ${text}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects requests when deletion is disabled", async () => {
    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "false");

    await expect(requestAccountDeletion(clerkId)).rejects.toMatchObject({
      status: 503,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("returns completed without repeating completed deletion", async () => {
    existing = { user_id: userId, completed: true };

    await expect(requestAccountDeletion(clerkId)).resolves.toEqual({
      status: "completed",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("reuses an existing pending request", async () => {
    existing = { user_id: userId, completed: false };

    await expect(requestAccountDeletion(clerkId)).resolves.toEqual({
      status: "pending",
    });
    expect(events).not.toContain("begin");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects a mismatched Clerk identity", async () => {
    mocks.getUser.mockResolvedValue({
      id: "user_other",
      deleteSelfEnabled: false,
    });

    await expect(requestAccountDeletion(clerkId)).rejects.toMatchObject({
      status: 403,
    });
    expect(events).not.toContain("begin");
  });

  it("disables direct Clerk self-deletion before accepting the request", async () => {
    mocks.getUser.mockResolvedValue({
      id: clerkId,
      deleteSelfEnabled: true,
    });

    await expect(requestAccountDeletion(clerkId)).resolves.toEqual({
      status: "pending",
    });
    expect(mocks.updateUser).toHaveBeenCalledWith(clerkId, {
      deleteSelfEnabled: false,
    });
    expect(events).toContain("begin");
  });

  it("does not accept deletion if direct-deletion protection fails", async () => {
    mocks.getUser.mockResolvedValue({
      id: clerkId,
      deleteSelfEnabled: true,
    });
    mocks.updateUser.mockRejectedValue(new Error("Clerk unavailable"));

    await expect(requestAccountDeletion(clerkId)).rejects.toThrow(
      "Clerk unavailable",
    );
    expect(events).not.toContain("begin");
  });

  it("fails before accepting an unconfigured billing environment", async () => {
    mapped = [{ ...customer, livemode: true }];

    await expect(requestAccountDeletion(clerkId)).rejects.toMatchObject({
      status: 503,
    });
    expect(events).not.toContain("begin");
  });

  it("returns 409 when AI or billing is busy", async () => {
    beginStatus = "busy";

    await expect(requestAccountDeletion(clerkId)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("expires checkout, cancels billing, and disables invoice automation", async () => {
    sessions = [record("cs_open", "open")];
    schedules = [record("sched_active", "active")];
    subscriptions = [record("sub_active", "active")];
    invoices = [
      { ...record("in_open", "open"), auto_advance: true },
      { ...record("in_draft", "draft"), auto_advance: false },
    ];

    await stopAccountBillingForCustomer(customer);

    expect(mocks.checkoutExpire).toHaveBeenCalledWith("cs_open");
    expect(mocks.scheduleCancel).toHaveBeenCalledWith("sched_active", {
      invoice_now: false,
      prorate: false,
    });
    expect(mocks.subscriptionCancel).toHaveBeenCalledWith("sub_active", {
      invoice_now: false,
      prorate: false,
    });
    expect(mocks.invoiceUpdate).toHaveBeenCalledExactlyOnceWith("in_open", {
      auto_advance: false,
    });
    expect(events).toContain("premium disabled");
    expect(events.at(-1)).toBe("billing lock released");
  });

  it("does not cancel terminal subscriptions again", async () => {
    subscriptions = [
      record("sub_canceled", "canceled"),
      record("sub_expired", "incomplete_expired"),
    ];

    await stopAccountBillingForCustomer(customer);

    expect(mocks.subscriptionCancel).not.toHaveBeenCalled();
  });

  it("rejects billing objects belonging to another customer", async () => {
    subscriptions = [
      {
        ...record("sub_wrong", "active"),
        customer: "cus_other",
      },
    ];

    await expect(stopAccountBillingForCustomer(customer)).rejects.toMatchObject(
      { status: 503 },
    );

    expect(mocks.subscriptionCancel).not.toHaveBeenCalled();
    expect(events).toContain("billing lock released");
    expect(events).not.toContain("premium disabled");
  });

  it("rejects a customer with mismatched account metadata", async () => {
    mocks.customerRetrieve.mockResolvedValue({
      id: customerId,
      deleted: false,
      livemode: false,
      metadata: { stackwing_user_id: "another-user" },
    });

    await expect(stopAccountBillingForCustomer(customer)).rejects.toMatchObject(
      { status: 503 },
    );

    expect(mocks.checkoutList).not.toHaveBeenCalled();
    expect(events).toContain("billing lock released");
  });

  it("requires an acquired billing lease", async () => {
    billingLockAvailable = false;

    await expect(stopAccountBillingForCustomer(customer)).rejects.toMatchObject(
      { status: 409 },
    );

    expect(mocks.customerRetrieve).not.toHaveBeenCalled();
  });

  it("stops when the billing heartbeat loses its lease", async () => {
    heartbeatAvailable = false;

    await expect(stopAccountBillingForCustomer(customer)).rejects.toMatchObject(
      { status: 409 },
    );

    expect(mocks.customerRetrieve).not.toHaveBeenCalled();
    expect(events).toContain("billing lock released");
  });

  it("accepts an expiration race only after checkout is confirmed closed", async () => {
    sessions = [record("cs_race", "open")];

    mocks.checkoutExpire.mockImplementation(async (id: string) => {
      ownedRecord(sessions, id).status = "complete";
      throw new Error("Checkout completed concurrently");
    });

    await expect(
      stopAccountBillingForCustomer(customer),
    ).resolves.toBeUndefined();

    expect(mocks.checkoutRetrieve).toHaveBeenCalledWith("cs_race");
  });

  it("rejects a failed expiration while checkout remains open", async () => {
    sessions = [record("cs_open", "open")];
    mocks.checkoutExpire.mockRejectedValue(new Error("Expiration unavailable"));

    await expect(stopAccountBillingForCustomer(customer)).rejects.toThrow(
      "Expiration unavailable",
    );

    expect(events).not.toContain("premium disabled");
    expect(events).toContain("billing lock released");
  });

  it("deletes Clerk only after billing shutdown succeeds", async () => {
    enableClaim();
    customers = [customer];
    subscriptions = [record("sub_active", "active")];

    await processAccountDeletion(userId);

    expect(events.indexOf("subscription canceled")).toBeLessThan(
      events.indexOf("clerk deleted"),
    );
    expect(events.indexOf("billing milestone")).toBeLessThan(
      events.indexOf("clerk deleted"),
    );
    expect(events.indexOf("clerk milestone")).toBeLessThan(
      events.indexOf("finish"),
    );
    expect(events).not.toContain("retry:billing");
  });

  it("preserves Clerk and queues a retry when Stripe fails", async () => {
    enableClaim();
    customers = [customer];
    subscriptions = [record("sub_active", "active")];
    mocks.subscriptionCancel.mockRejectedValue(new Error("Stripe unavailable"));

    await processAccountDeletion(userId);

    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(events).toContain("retry:billing");
    expect(events).not.toContain("finish");
  });

  it("retries a Clerk failure and later completes", async () => {
    enableClaim();
    mocks.deleteUser.mockRejectedValueOnce(new Error("Clerk unavailable"));

    await processAccountDeletion(userId);

    expect(events).toContain("retry:clerk");
    expect(events).not.toContain("finish");

    enableClaim();
    await processAccountDeletion(userId);

    expect(mocks.deleteUser).toHaveBeenCalledTimes(2);
    expect(events).toContain("finish");
  });

  it("accepts a typed Clerk 404 from an earlier successful attempt", async () => {
    enableClaim();
    mocks.deleteUser.mockRejectedValue(
      Object.assign(new Error("Already deleted"), {
        clerk: true,
        status: 404,
      }),
    );

    await processAccountDeletion(userId);

    expect(events).toContain("clerk milestone");
    expect(events).toContain("finish");
    expect(events).not.toContain("retry:clerk");
  });

  it("does not treat an arbitrary 404-shaped error as Clerk success", async () => {
    enableClaim();
    mocks.deleteUser.mockRejectedValue({ status: 404 });

    await processAccountDeletion(userId);

    expect(events).toContain("retry:clerk");
    expect(events).not.toContain("finish");
  });

  it("rechecks billing but skips completed Clerk deletion on recovery", async () => {
    enableClaim(true);
    customers = [customer];

    await processAccountDeletion(userId);

    expect(mocks.customerRetrieve).toHaveBeenCalledWith(customerId);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(events).toContain("finish");
  });

  it("queues a database retry if final cleanup cannot complete", async () => {
    enableClaim();
    finishAvailable = false;

    await processAccountDeletion(userId);

    expect(events).toContain("retry:database");
  });

  it("does nothing when a job cannot be claimed", async () => {
    await processAccountDeletion(userId);

    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.customerRetrieve).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("processes due jobs returned by the queue", async () => {
    pending = [{ user_id: userId }];
    enableClaim();

    await processPendingAccountDeletions();

    expect(mocks.deleteUser).toHaveBeenCalledWith(clerkId);
    expect(events).toContain("finish");
  });
  it("does not claim queued deletions after shutdown starts", async () => {
    vi.spyOn(runtime, "isShuttingDown").mockReturnValue(true);

    pending = [{ user_id: userId }];

    await processPendingAccountDeletions();

    // Only the pending-jobs SELECT ran; no job was claimed.
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(events).not.toContain("finish");
  });

  it("stops picking the next queued deletion when shutdown begins", async () => {
    vi.spyOn(runtime, "isShuttingDown")
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const nextUserId = "00000000-0000-4000-8000-000000000002";

    mocks.execute
      .mockResolvedValueOnce({
        rows: [{ user_id: userId }, { user_id: nextUserId }],
      })
      .mockResolvedValueOnce({
        // First job was already claimed elsewhere.
        rows: [],
      });

    await processPendingAccountDeletions();

    // Pending-jobs SELECT + first claim, but no second claim.
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("tracks a deletion started outside the polling worker", async () => {
    let release!: (value: { rows: unknown[] }) => void;

    mocks.execute.mockImplementationOnce(
      () =>
        new Promise<{ rows: unknown[] }>((resolve) => {
          release = resolve;
        }),
    );

    const processing = processAccountDeletion(userId);
    const settledProcessing = Promise.allSettled([processing]);

    let idle = false;

    const waiting = runtime.waitForTasks().then(() => {
      idle = true;
    });

    try {
      await Promise.resolve();

      expect(idle).toBe(false);

      // An empty claim is a normal, already-owned/no-op result.
      release({ rows: [] });

      await processing;
      await waiting;

      expect(idle).toBe(true);
      expect(mocks.deleteUser).not.toHaveBeenCalled();
    } finally {
      release?.({ rows: [] });
      await settledProcessing;
    }
  });
});
