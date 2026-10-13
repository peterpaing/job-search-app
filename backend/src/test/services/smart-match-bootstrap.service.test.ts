import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseJob } from "../../db/schema.js";
import { jobs } from "../../db/schema.js";
import { smartMatchProfiles } from "../../db/smart-match.schema.js";
import { getSmartMatchBootstrap } from "../../services/smart-match-bootstrap.service.js";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  user: vi.fn(),
  usage: vi.fn(),
}));
vi.mock("../../db/index.js", () => ({ db: { select: mocks.select } }));
vi.mock("../../services/users.service.js", () => ({
  getOrCreateUser: mocks.user,
}));
vi.mock("../../services/smart-match.budget.js", () => ({
  usageFor: mocks.usage,
}));
const profile = {
  skills: ["React"],
  roles: ["Frontend Engineer"],
  experience: "mid",
  location: "",
  workMode: "any",
};
const record: DatabaseJob = {
  id: "job",
  source: "Test",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  description: "Requirements:\nReact.",
  location: "Remote",
  country: null,
  tags: ["React"],
  url: "https://example.com/job",
  postedAt: new Date().toISOString(),
  isActive: true,
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function rows(result: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn().mockResolvedValue(result),
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "account-a" });
  mocks.usage.mockResolvedValue({ used: 0, remaining: 20 });
});

describe("SmartMatch bootstrap", () => {
  it("looks up the account/profile once and returns current usage and matches", async () => {
    const profileQuery = rows([{ profile }]);
    const jobsQuery = rows([record]);
    mocks.select
      .mockReturnValueOnce(profileQuery)
      .mockReturnValueOnce(jobsQuery);
    const result = await getSmartMatchBootstrap("verified-a");
    expect(mocks.user).toHaveBeenCalledTimes(1);
    expect(mocks.user).toHaveBeenCalledWith("verified-a");
    expect(profileQuery.from).toHaveBeenCalledWith(smartMatchProfiles);
    expect(jobsQuery.from).toHaveBeenCalledWith(jobs);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.usage).toHaveBeenCalledWith("account-a");
    expect(result.profile).toEqual(profile);
    expect(result.matches[0]?.job.id).toBe("job");
  });

  it("does not query jobs or return 409 when no profile exists", async () => {
    mocks.select.mockReturnValue(rows([]));
    const result = await getSmartMatchBootstrap("verified-a");
    expect(result.profile).toBeNull();
    expect(result.matches).toEqual([]);
    expect(result.searched).toBe(0);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("does not reuse account/profile state between users", async () => {
    mocks.user
      .mockResolvedValueOnce({ id: "account-a" })
      .mockResolvedValueOnce({ id: "account-b" });
    mocks.select.mockReturnValue(rows([]));
    await getSmartMatchBootstrap("verified-a");
    await getSmartMatchBootstrap("verified-b");
    expect(mocks.usage.mock.calls.map(([id]) => id)).toEqual([
      "account-a",
      "account-b",
    ]);
    expect(mocks.user.mock.calls.map(([id]) => id)).toEqual([
      "verified-a",
      "verified-b",
    ]);
  });
});
