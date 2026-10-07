import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJobs } from "../../services/jobs.service.js";
import { getRemoteOkJobs } from "../../services/remote-ok.service.js";
import { getHimalayasJobs } from "../../services/himalayas.service.js";

vi.mock("../../services/remote-ok.service.js", () => ({
  getRemoteOkJobs: vi.fn(),
}));

vi.mock("../../services/himalayas.service.js", () => ({
  getHimalayasJobs: vi.fn(),
}));

const remoteOkMock = vi.mocked(getRemoteOkJobs);
const himalayasMock = vi.mocked(getHimalayasJobs);

const remoteOkJob = {
  id: "remote-ok-123",
  source: "Remote OK",
  title: "Frontend Engineer",
  company: "Example",
  companyLogo: null,
  location: "Singapore",
  tags: ["react"],
  url: "https://remoteok.com/remote-jobs/example-123",
  postedAt: "2026-10-08T00:00:00Z",
};

const himalayasJob = {
  id: "himalayas-example-456",
  source: "Himalayas",
  title: "Backend Developer",
  company: "Another Company",
  companyLogo: null,
  location: "Malaysia",
  tags: ["Node.js"],
  seniority: ["Senior"],
  employmentType: "Full Time",
  url: "https://himalayas.app/companies/example/jobs/backend-developer",
  postedAt: "2026-10-08T00:00:00.000Z",
};

describe("getJobs", () => {
  beforeEach(() => {
    remoteOkMock.mockReset();
    himalayasMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("combines jobs from both sources", async () => {
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);
    himalayasMock.mockResolvedValueOnce([himalayasJob]);

    await expect(getJobs()).resolves.toEqual([remoteOkJob, himalayasJob]);

    expect(remoteOkMock).toHaveBeenCalledTimes(1);
    expect(himalayasMock).toHaveBeenCalledTimes(1);
  });

  it("preserves Himalayas seniority and employment type", async () => {
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);
    himalayasMock.mockResolvedValueOnce([himalayasJob]);

    const jobs = await getJobs();
    const himalayasResult = jobs.find((job) => job.id === himalayasJob.id);

    expect(himalayasResult).toMatchObject({
      seniority: ["Senior"],
      employmentType: "Full Time",
    });
  });

  it("does not invent filter fields for Remote OK jobs", async () => {
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);
    himalayasMock.mockResolvedValueOnce([]);

    const [job] = await getJobs();

    expect(job).not.toHaveProperty("seniority");
    expect(job).not.toHaveProperty("employmentType");
  });

  it("preserves unknown Himalayas filter values", async () => {
    const job = {
      ...himalayasJob,
      seniority: [],
      employmentType: null,
    };

    remoteOkMock.mockResolvedValueOnce([]);
    himalayasMock.mockResolvedValueOnce([job]);

    await expect(getJobs()).resolves.toEqual([job]);
  });

  it("returns Himalayas jobs when Remote OK fails", async () => {
    const error = new Error("Remote OK unavailable");

    remoteOkMock.mockRejectedValueOnce(error);
    himalayasMock.mockResolvedValueOnce([himalayasJob]);

    await expect(getJobs()).resolves.toEqual([himalayasJob]);

    expect(console.error).toHaveBeenCalledWith("Job source failed:", error);
  });

  it("returns Remote OK jobs when Himalayas fails", async () => {
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);
    himalayasMock.mockRejectedValueOnce(new Error("Himalayas unavailable"));

    await expect(getJobs()).resolves.toEqual([remoteOkJob]);
  });

  it("throws when both sources fail", async () => {
    remoteOkMock.mockRejectedValueOnce(new Error("Remote OK failed"));
    himalayasMock.mockRejectedValueOnce(new Error("Himalayas failed"));

    await expect(getJobs()).rejects.toThrow("All job sources failed");
  });

  it("returns an empty array when both sources succeed with no jobs", async () => {
    remoteOkMock.mockResolvedValueOnce([]);
    himalayasMock.mockResolvedValueOnce([]);

    await expect(getJobs()).resolves.toEqual([]);
  });

  it("returns jobs when the other source succeeds with an empty array", async () => {
    remoteOkMock.mockResolvedValueOnce([]);
    himalayasMock.mockResolvedValueOnce([himalayasJob]);

    await expect(getJobs()).resolves.toEqual([himalayasJob]);
  });

  it("does not throw when one source fails and the other returns no jobs", async () => {
    remoteOkMock.mockRejectedValueOnce(new Error("Remote OK failed"));
    himalayasMock.mockResolvedValueOnce([]);

    await expect(getJobs()).resolves.toEqual([]);
  });

  it("does not log errors when both sources succeed", async () => {
    remoteOkMock.mockResolvedValueOnce([remoteOkJob]);
    himalayasMock.mockResolvedValueOnce([himalayasJob]);

    await getJobs();

    expect(console.error).not.toHaveBeenCalled();
  });
});
