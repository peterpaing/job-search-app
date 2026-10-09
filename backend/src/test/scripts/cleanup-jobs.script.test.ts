import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  cleanupJobs: vi.fn(),
}));

vi.mock("../../services/cleanup-jobs.service.js", () => ({
  cleanupJobs: serviceMocks.cleanupJobs,
}));

const originalExitCode = process.exitCode;

describe("cleanup-jobs script", () => {
  beforeEach(() => {
    vi.resetModules();
    serviceMocks.cleanupJobs.mockReset();

    process.exitCode = undefined;

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("cleans up jobs and logs the deleted count and cutoff", async () => {
    serviceMocks.cleanupJobs.mockResolvedValueOnce({
      deleted: 15,
      cutoff: "2026-09-09T12:00:00.000Z",
    });

    await import("../../scripts/cleanup-jobs.js");

    await vi.waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        "Deleted 15 jobs stored before 2026-09-09T12:00:00.000Z.",
      );
    });

    expect(serviceMocks.cleanupJobs).toHaveBeenCalledTimes(1);
    expect(serviceMocks.cleanupJobs).toHaveBeenCalledWith();
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("logs a successful cleanup when no jobs are deleted", async () => {
    serviceMocks.cleanupJobs.mockResolvedValueOnce({
      deleted: 0,
      cutoff: "2026-09-09T12:00:00.000Z",
    });

    await import("../../scripts/cleanup-jobs.js");

    await vi.waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        "Deleted 0 jobs stored before 2026-09-09T12:00:00.000Z.",
      );
    });

    expect(serviceMocks.cleanupJobs).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("logs an error and sets a failing exit code when cleanup fails", async () => {
    const error = new Error("Database unavailable");

    serviceMocks.cleanupJobs.mockRejectedValueOnce(error);

    await import("../../scripts/cleanup-jobs.js");

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        "Failed to clean up old jobs:",
        error,
      );
      expect(process.exitCode).toBe(1);
    });

    expect(serviceMocks.cleanupJobs).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });
});
