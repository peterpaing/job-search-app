import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDevGlobalJobs } from "../../services/dev-global-jobs.service.js";
import { getHimalayasJobs } from "../../services/himalayas.service.js";

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

const fetchMock = vi.fn<typeof fetch>();

function respond(payload: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );
}

function himalayasJob(id: number, title = "Frontend Engineer") {
  return {
    guid: `https://himalayas.app/companies/example/jobs/job-${id}`,
    title,
    companyName: "Example",
    applicationLink: `https://himalayas.app/companies/example/jobs/job-${id}`,
    pubDate: 1791417600,
  };
}

function devGlobalJob(id: number, title = "Frontend Engineer") {
  return {
    id,
    title,
    organization: "Example",
    category: "technology",
    postedAt: "2026-10-08T00:00:00Z",
    url: `https://devglobaljobs.com/jobs/detail/${id}`,
  };
}

function devGlobalPage(start: number, title = "Frontend Engineer") {
  return Array.from({ length: 100 }, (_, index) =>
    devGlobalJob(start + index, title),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(delay).mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Himalayas pagination", () => {
  it("follows an encoded cursor even when the first page is short", async () => {
    respond({
      jobs: [himalayasJob(1)],
      nextCursor: "next+/=",
    });
    respond({ jobs: [himalayasJob(2)] });

    const jobs = await getHimalayasJobs();

    expect(jobs).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondUrl = new URL(String(fetchMock.mock.calls[1]![0]));

    expect(secondUrl.origin).toBe("https://himalayas.app");
    expect(secondUrl.searchParams.get("limit")).toBe("20");
    expect(secondUrl.searchParams.get("cursor")).toBe("next+/=");
    expect(delay).toHaveBeenCalledWith(1_100);
  });

  it("removes duplicate jobs across pages", async () => {
    respond({
      jobs: [himalayasJob(1)],
      nextCursor: "page-two",
    });
    respond({
      jobs: [himalayasJob(1), himalayasJob(2)],
    });

    const jobs = await getHimalayasJobs();

    expect(jobs.map((job) => job.id)).toEqual([
      `himalayas-${himalayasJob(1).guid}`,
      `himalayas-${himalayasJob(2).guid}`,
    ]);
  });

  it("continues after a page containing no developer roles", async () => {
    respond({
      jobs: [himalayasJob(1, "Marketing Manager")],
      nextCursor: "page-two",
    });
    respond({ jobs: [himalayasJob(2)] });

    const jobs = await getHimalayasJobs();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(`himalayas-${himalayasJob(2).guid}`);
  });

  it("stops when the cursor is absent", async () => {
    respond({
      jobs: Array.from({ length: 20 }, (_, index) => himalayasJob(index)),
    });

    expect(await getHimalayasJobs()).toHaveLength(20);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("rejects repeated cursors instead of looping", async () => {
    respond({
      jobs: [himalayasJob(1)],
      nextCursor: "same-cursor",
    });
    respond({
      jobs: [himalayasJob(2)],
      nextCursor: "same-cursor",
    });

    await expect(getHimalayasJobs()).rejects.toThrow(
      "Himalayas pagination returned a repeated cursor",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid cursor metadata", async () => {
    respond({
      jobs: [himalayasJob(1)],
      nextCursor: 123,
    });

    await expect(getHimalayasJobs()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails the source if a later page fails", async () => {
    respond({
      jobs: [himalayasJob(1)],
      nextCursor: "page-two",
    });
    respond({ message: "Unavailable" }, 503);

    await expect(getHimalayasJobs()).rejects.toThrow(
      "Himalayas request failed: 503",
    );
  });

  it("stops at the page limit and reports incomplete coverage", async () => {
    for (let index = 0; index < 20; index += 1) {
      respond({
        jobs: [himalayasJob(index)],
        nextCursor: `cursor-${index}`,
      });
    }

    expect(await getHimalayasJobs()).toHaveLength(20);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(delay).toHaveBeenCalledTimes(19);
    expect(console.warn).toHaveBeenCalledWith(
      "Himalayas import reached its 20-page safety limit; additional listings were not fetched.",
    );
  });
});

describe("Dev Global Jobs pagination", () => {
  it("increments the offset while retaining the category filter", async () => {
    respond({ jobs: devGlobalPage(1) });
    respond({ jobs: [devGlobalJob(101)] });

    const jobs = await getDevGlobalJobs();

    expect(jobs).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondUrl = new URL(String(fetchMock.mock.calls[1]![0]));

    expect(secondUrl.origin).toBe("https://devglobaljobs.com");
    expect(secondUrl.searchParams.get("limit")).toBe("100");
    expect(secondUrl.searchParams.get("category")).toBe("technology");
    expect(secondUrl.searchParams.get("offset")).toBe("100");
    expect(delay).toHaveBeenCalledWith(1_100);
  });

  it("removes overlapping jobs across pages", async () => {
    respond({ jobs: devGlobalPage(1) });
    respond({
      jobs: [devGlobalJob(100), devGlobalJob(101)],
    });

    const jobs = await getDevGlobalJobs();

    expect(jobs).toHaveLength(101);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(101);
  });

  it("continues after a full page containing no developer roles", async () => {
    respond({ jobs: devGlobalPage(1, "Marketing Manager") });
    respond({ jobs: [devGlobalJob(101)] });

    const jobs = await getDevGlobalJobs();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs.map((job) => job.id)).toEqual(["dev-global-jobs-101"]);
  });

  it("stops after a short page", async () => {
    respond({ jobs: [devGlobalJob(1)] });

    expect(await getDevGlobalJobs()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("stops after an empty page", async () => {
    respond({ jobs: devGlobalPage(1) });
    respond({ jobs: [] });

    expect(await getDevGlobalJobs()).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects repeated full pages that make no progress", async () => {
    respond({ jobs: devGlobalPage(1) });
    respond({ jobs: devGlobalPage(1) });

    await expect(getDevGlobalJobs()).rejects.toThrow(
      "Dev Global Jobs pagination made no progress",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails the source if a later page fails", async () => {
    respond({ jobs: devGlobalPage(1) });
    respond({ message: "Unavailable" }, 503);

    await expect(getDevGlobalJobs()).rejects.toThrow(
      "Dev Global Jobs request failed: 503",
    );
  });

  it("rejects malformed later pages", async () => {
    respond({ jobs: devGlobalPage(1) });
    respond({ jobs: "invalid" });

    await expect(getDevGlobalJobs()).rejects.toThrow();
  });

  it("stops at the page limit and reports potentially incomplete coverage", async () => {
    for (let index = 0; index < 10; index += 1) {
      respond({ jobs: devGlobalPage(index * 100 + 1) });
    }

    expect(await getDevGlobalJobs()).toHaveLength(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(delay).toHaveBeenCalledTimes(9);
    expect(console.warn).toHaveBeenCalledWith(
      "Dev Global Jobs import reached its 10-page safety limit; additional listings may remain.",
    );
  });
});
