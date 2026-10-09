import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  importJobs: vi.fn(),
}));

vi.mock("../../services/import-jobs.service.js", () => ({
  importJobs: serviceMocks.importJobs,
}));

const originalExitCode = process.exitCode;

describe("import-jobs script", () => {
  beforeEach(() => {
    vi.resetModules();
    serviceMocks.importJobs.mockReset();

    process.exitCode = undefined;

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("imports jobs and logs the result", async () => {
    serviceMocks.importJobs.mockResolvedValueOnce({
      fetched: 120,
      processed: 100,
    });

    await import("../../scripts/import-jobs.js");

    await vi.waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        "Import complete: fetched 120 jobs, inserted or updated 100 unique jobs.",
      );
    });

    expect(serviceMocks.importJobs).toHaveBeenCalledTimes(1);
    expect(serviceMocks.importJobs).toHaveBeenCalledWith();
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("logs a successful import when no jobs are returned", async () => {
    serviceMocks.importJobs.mockResolvedValueOnce({
      fetched: 0,
      processed: 0,
    });

    await import("../../scripts/import-jobs.js");

    await vi.waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        "Import complete: fetched 0 jobs, inserted or updated 0 unique jobs.",
      );
    });

    expect(serviceMocks.importJobs).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("logs an error and sets a failing exit code when importing fails", async () => {
    const error = new Error("Database unavailable");

    serviceMocks.importJobs.mockRejectedValueOnce(error);

    await import("../../scripts/import-jobs.js");

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith("Job import failed:", error);
      expect(process.exitCode).toBe(1);
    });

    expect(serviceMocks.importJobs).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });
});
