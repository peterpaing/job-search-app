import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJobs } from "../../services/jobs.service.js";
import { getHimalayasJobs } from "../../services/himalayas.service.js";
import { getDevGlobalJobs } from "../../services/dev-global-jobs.service.js";
import { getWeWorkRemotelyJobs } from "../../services/we-work-remotely.service.js";
import { getRemoteOkJobs } from "../../services/remote-ok.service.js";

vi.mock("../../services/himalayas.service.js", () => ({
  getHimalayasJobs: vi.fn(),
}));

vi.mock("../../services/dev-global-jobs.service.js", () => ({
  getDevGlobalJobs: vi.fn(),
}));

vi.mock("../../services/we-work-remotely.service.js", () => ({
  getWeWorkRemotelyJobs: vi.fn(),
}));

vi.mock("../../services/remote-ok.service.js", () => ({
  getRemoteOkJobs: vi.fn(),
}));

const himalayasMock = vi.mocked(getHimalayasJobs);
const devGlobalMock = vi.mocked(getDevGlobalJobs);
const wwrMock = vi.mocked(getWeWorkRemotelyJobs);
const remoteOkMock = vi.mocked(getRemoteOkJobs);

const himalayasJob = {
  id: "himalayas-123",
  source: "Himalayas",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  location: "Singapore",
  tags: ["React"],
  seniority: ["Senior"],
  employmentType: "Full Time",
  url: "https://himalayas.app/companies/example/jobs/frontend-engineer",
  postedAt: "2026-10-08T00:00:00.000Z",
};

const devGlobalJob = {
  id: "dev-global-jobs-456",
  source: "Dev Global Jobs",
  title: "Backend Developer",
  company: "Another Company",
  companyLogo: null,
  location: "Malaysia",
  country: "MY",
  tags: ["technology"],
  seniority: [],
  employmentType: "Full-time",
  url: "https://devglobaljobs.com/jobs/detail/456",
  postedAt: "2026-10-08T00:00:00Z",
};

const wwrJob = {
  id: "we-work-remotely-789",
  source: "We Work Remotely",
  title: "Software Engineer",
  company: "Remote Company",
  companyLogo: null,
  location: "Anywhere in the World",
  tags: ["Full-Stack Programming"],
  url: "https://weworkremotely.com/remote-jobs/example-software-engineer",
  postedAt: "2026-10-08T00:00:00.000Z",
};

const remoteOkJob = {
  id: "remote-ok-101",
  source: "Remote OK",
  title: "Mobile Developer",
  company: "Mobile Company",
  companyLogo: null,
  location: null,
  tags: ["mobile"],
  url: "https://remoteok.com/remote-jobs/example-101",
  postedAt: "2026-10-08T00:00:00Z",
};

describe("getJobs", () => {
  beforeEach(() => {
    himalayasMock.mockReset();
    devGlobalMock.mockReset();
    wwrMock.mockReset();
    remoteOkMock.mockReset();

    // Each source succeeds with no jobs unless a test overrides it.
    himalayasMock.mockResolvedValue([]);
    devGlobalMock.mockResolvedValue([]);
    wwrMock.mockResolvedValue([]);
    remoteOkMock.mockResolvedValue([]);

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("combines all sources in the configured priority order", async () => {
    himalayasMock.mockResolvedValueOnce([himalayasJob]);
    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);
    wwrMock.mockResolvedValueOnce([wwrJob]);
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    await expect(getJobs()).resolves.toEqual([
      himalayasJob,
      devGlobalJob,
      wwrJob,
      remoteOkJob,
    ]);

    expect(himalayasMock).toHaveBeenCalledTimes(1);
    expect(devGlobalMock).toHaveBeenCalledTimes(1);
    expect(wwrMock).toHaveBeenCalledTimes(1);
    expect(remoteOkMock).toHaveBeenCalledTimes(1);
  });

  it("preserves priority even when Himalayas finishes last", async () => {
    let resolveHimalayas!: (
      jobs: Awaited<ReturnType<typeof getHimalayasJobs>>,
    ) => void;

    himalayasMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHimalayas = resolve;
      }),
    );

    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);
    wwrMock.mockResolvedValueOnce([wwrJob]);
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    const result = getJobs();

    expect(devGlobalMock).toHaveBeenCalledTimes(1);
    expect(wwrMock).toHaveBeenCalledTimes(1);
    expect(remoteOkMock).toHaveBeenCalledTimes(1);

    // Let the other sources settle before resolving Himalayas.
    await Promise.resolve();
    resolveHimalayas([himalayasJob]);

    await expect(result).resolves.toEqual([
      himalayasJob,
      devGlobalJob,
      wwrJob,
      remoteOkJob,
    ]);
  });

  it("preserves the order of jobs within a source", async () => {
    const secondJob = {
      ...himalayasJob,
      id: "himalayas-124",
      title: "Backend Developer",
    };

    himalayasMock.mockResolvedValueOnce([himalayasJob, secondJob]);
    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);

    await expect(getJobs()).resolves.toEqual([
      himalayasJob,
      secondJob,
      devGlobalJob,
    ]);
  });

  it("preserves seniority, employment type and country fields", async () => {
    himalayasMock.mockResolvedValueOnce([himalayasJob]);
    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);

    const jobs = await getJobs();

    expect(jobs[0]).toMatchObject({
      seniority: ["Senior"],
      employmentType: "Full Time",
    });

    expect(jobs[1]).toMatchObject({
      country: "MY",
      seniority: [],
      employmentType: "Full-time",
    });
  });

  it("does not invent filter fields for sources without them", async () => {
    wwrMock.mockResolvedValueOnce([wwrJob]);
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    const jobs = await getJobs();

    for (const job of jobs) {
      expect(job).not.toHaveProperty("seniority");
      expect(job).not.toHaveProperty("employmentType");
    }
  });

  it("returns other jobs when Himalayas fails", async () => {
    const error = new Error("Himalayas unavailable");

    himalayasMock.mockRejectedValueOnce(error);
    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);
    wwrMock.mockResolvedValueOnce([wwrJob]);
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    await expect(getJobs()).resolves.toEqual([
      devGlobalJob,
      wwrJob,
      remoteOkJob,
    ]);

    expect(console.error).toHaveBeenCalledWith("Job source failed:", error);
  });

  it("returns other jobs when Dev Global Jobs fails", async () => {
    himalayasMock.mockResolvedValueOnce([himalayasJob]);
    devGlobalMock.mockRejectedValueOnce(
      new Error("Dev Global Jobs unavailable"),
    );
    wwrMock.mockResolvedValueOnce([wwrJob]);
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    await expect(getJobs()).resolves.toEqual([
      himalayasJob,
      wwrJob,
      remoteOkJob,
    ]);
  });

  it("returns other jobs when We Work Remotely fails", async () => {
    himalayasMock.mockResolvedValueOnce([himalayasJob]);
    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);
    wwrMock.mockRejectedValueOnce(new Error("WWR unavailable"));
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    await expect(getJobs()).resolves.toEqual([
      himalayasJob,
      devGlobalJob,
      remoteOkJob,
    ]);
  });

  it("returns other jobs when Remote OK fails", async () => {
    himalayasMock.mockResolvedValueOnce([himalayasJob]);
    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);
    wwrMock.mockResolvedValueOnce([wwrJob]);
    remoteOkMock.mockRejectedValueOnce(new Error("Remote OK unavailable"));

    await expect(getJobs()).resolves.toEqual([
      himalayasJob,
      devGlobalJob,
      wwrJob,
    ]);
  });

  it("returns the remaining source when three sources fail", async () => {
    himalayasMock.mockRejectedValueOnce(new Error("Himalayas failed"));
    devGlobalMock.mockRejectedValueOnce(new Error("Dev Global Jobs failed"));
    wwrMock.mockRejectedValueOnce(new Error("WWR failed"));
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    await expect(getJobs()).resolves.toEqual([remoteOkJob]);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("throws when all sources fail", async () => {
    himalayasMock.mockRejectedValueOnce(new Error("Himalayas failed"));
    devGlobalMock.mockRejectedValueOnce(new Error("Dev Global Jobs failed"));
    wwrMock.mockRejectedValueOnce(new Error("WWR failed"));
    remoteOkMock.mockRejectedValueOnce(new Error("Remote OK failed"));

    await expect(getJobs()).rejects.toThrow("All job sources failed");
    expect(console.error).toHaveBeenCalledTimes(4);
  });

  it("returns an empty array when all sources succeed with no jobs", async () => {
    await expect(getJobs()).resolves.toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not throw when one source succeeds with no jobs", async () => {
    himalayasMock.mockRejectedValueOnce(new Error("Himalayas failed"));
    devGlobalMock.mockRejectedValueOnce(new Error("Dev Global Jobs failed"));
    wwrMock.mockRejectedValueOnce(new Error("WWR failed"));

    await expect(getJobs()).resolves.toEqual([]);
  });

  it("does not log errors when all sources succeed", async () => {
    himalayasMock.mockResolvedValueOnce([himalayasJob]);
    devGlobalMock.mockResolvedValueOnce([devGlobalJob]);
    wwrMock.mockResolvedValueOnce([wwrJob]);
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);

    await getJobs();

    expect(console.error).not.toHaveBeenCalled();
  });
});
