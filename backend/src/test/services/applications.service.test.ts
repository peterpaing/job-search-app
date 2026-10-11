import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applications, jobs, users } from "../../db/schema.js";
import {
  getApplications,
  trackApplication,
  updateApplication,
  removeApplication,
} from "../../services/applications.service.js";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  insertReturning: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  getOrCreateUser: vi.fn(),
  rows: [] as unknown[][],
}));

vi.mock("../../db/index.js", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

vi.mock("../../services/users.service.js", () => ({
  getOrCreateUser: mocks.getOrCreateUser,
}));

const user = {
  id: "a4c4cf3d-9584-4b14-8a2f-16e0faab7764",
  clerkUserId: "user_verified",
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

const record = {
  id: "application-a",
  userId: user.id,
  jobId: "job-a",
  title: "Frontend Engineer",
  company: "Example",
  url: "https://example.com/job-a",
  status: "applied",
  notes: "",
  appliedAt: "2026-10-11T01:00:00.000Z",
  updatedAt: "2026-10-11T01:00:00.000Z",
};

const storedJob = {
  id: "job-a",
  title: "Trusted database title",
  company: "Trusted company",
  url: "https://example.com/job-a",
};

function selectBuilder() {
  let condition: SQL | undefined;

  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn((value: SQL) => {
      condition = value;
      return builder;
    }),
    limit: vi.fn(async () => mocks.rows.shift() ?? []),
    orderBy: vi.fn(async () => mocks.rows.shift() ?? []),

    // Support the user-ID subquery inside inArray().
    getSQL: () =>
      sql`select ${users.id} from ${users} where ${condition ?? sql`true`}`,
  };

  return builder;
}

function expectOwnedCondition(condition: SQL) {
  const query = new PgDialect().sqlToQuery(condition);

  expect(query.sql).toContain('"applications"."job_id"');
  expect(query.sql).toContain('"users"."clerk_user_id"');
  expect(query.params).toEqual(["job-a", "user_verified"]);
}

describe("applications service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows.length = 0;

    mocks.getOrCreateUser.mockResolvedValue(user);
    mocks.select.mockImplementation(selectBuilder);

    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.values.mockReturnValue({
      onConflictDoNothing: mocks.onConflictDoNothing,
    });
    mocks.onConflictDoNothing.mockReturnValue({
      returning: mocks.insertReturning,
    });
    mocks.insertReturning.mockResolvedValue([record]);

    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({
      returning: mocks.updateReturning,
    });
    mocks.updateReturning.mockResolvedValue([record]);

    mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
    mocks.deleteWhere.mockResolvedValue([]);
  });

  it("creates an application using trusted job details", async () => {
    mocks.rows.push([], [storedJob]);

    const result = await trackApplication("user_verified", "job-a");

    expect(mocks.getOrCreateUser).toHaveBeenCalledWith("user_verified");
    expect(mocks.insert).toHaveBeenCalledWith(applications);
    expect(mocks.values).toHaveBeenCalledWith({
      userId: user.id,
      jobId: storedJob.id,
      title: storedJob.title,
      company: storedJob.company,
      url: storedJob.url,
    });
    expect(result?.jobId).toBe("job-a");
    expect(result).not.toHaveProperty("userId");
  });

  it("preserves an existing application's status, notes, and date", async () => {
    const existing = {
      ...record,
      status: "interviewing",
      notes: "Existing notes",
    };

    mocks.rows.push([existing]);

    const result = await trackApplication("user_verified", "job-a");

    expect(result).toMatchObject({
      status: "interviewing",
      notes: "Existing notes",
      appliedAt: record.appliedAt,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not create applications for missing jobs", async () => {
    mocks.rows.push([], []);

    await expect(
      trackApplication("user_verified", "job-a"),
    ).resolves.toBeNull();

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns the existing record after a concurrent insert conflict", async () => {
    mocks.rows.push([], [storedJob], [record]);
    mocks.insertReturning.mockResolvedValue([]);

    const result = await trackApplication("user_verified", "job-a");

    expect(result?.id).toBe(record.id);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: [applications.userId, applications.jobId],
    });
  });

  it("throws when a conflicting application cannot be found", async () => {
    mocks.rows.push([], [storedJob], []);
    mocks.insertReturning.mockResolvedValue([]);

    await expect(trackApplication("user_verified", "job-a")).rejects.toThrow(
      "Unable to find the application record",
    );
  });

  it("lists normalized application records without exposing user IDs", async () => {
    mocks.rows.push([record]);

    const result = await getApplications("user_verified");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: record.id,
      jobId: record.jobId,
      appliedAt: record.appliedAt,
    });
    expect(result[0]).not.toHaveProperty("userId");

    const builders = mocks.select.mock.results.map((result) => result.value);

    const applicationBuilder = builders.find(
      (builder) => builder.from.mock.calls[0]?.[0] === applications,
    );

    const condition = applicationBuilder.where.mock.calls[0][0];
    const query = new PgDialect().sqlToQuery(condition);

    expect(query.sql).toContain('"users"."clerk_user_id"');
    expect(query.params).toEqual(["user_verified"]);
  });

  it("updates only the verified user's application", async () => {
    await updateApplication("user_verified", "job-a", {
      status: "interviewing",
      notes: "Friday interview",
    });

    expect(mocks.update).toHaveBeenCalledWith(applications);
    expect(mocks.set).toHaveBeenCalledWith({
      status: "interviewing",
      notes: "Friday interview",
      updatedAt: expect.any(String),
    });

    expectOwnedCondition(mocks.updateWhere.mock.calls[0][0] as SQL);
  });

  it("returns null when an update finds no owned application", async () => {
    mocks.updateReturning.mockResolvedValue([]);

    await expect(
      updateApplication("user_verified", "job-a", {
        notes: "A note",
      }),
    ).resolves.toBeNull();
  });

  it("deletes only the verified user's application", async () => {
    await removeApplication("user_verified", "job-a");

    expect(mocks.delete).toHaveBeenCalledWith(applications);

    expectOwnedCondition(mocks.deleteWhere.mock.calls[0][0] as SQL);
  });

  it("propagates database errors", async () => {
    mocks.rows.push([], [storedJob]);
    mocks.insertReturning.mockRejectedValue(new Error("Database unavailable"));

    await expect(trackApplication("user_verified", "job-a")).rejects.toThrow(
      "Database unavailable",
    );
  });

  it("looks up the original job from the jobs table", async () => {
    mocks.rows.push([], [storedJob]);

    await trackApplication("user_verified", "job-a");

    const builders = mocks.select.mock.results.map((result) => result.value);

    expect(
      builders.some((builder) => builder.from.mock.calls[0]?.[0] === jobs),
    ).toBe(true);
  });
});
