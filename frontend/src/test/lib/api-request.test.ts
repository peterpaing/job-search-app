import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../app/lib/api-request";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("shared API requests", () => {
  it("preserves authentication, cache settings, path encoding, and signal", async () => {
    const response = new Response(null, { status: 200 });
    const controller = new AbortController();

    fetchMock.mockResolvedValueOnce(response);

    await expect(
      apiRequest({
        path: "/api/applications/job%2Fa",
        token: "test-token",
        signal: controller.signal,
      }),
    ).resolves.toBe(response);

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(String(url)).toBe(
      "https://api.example.com/api/applications/job%2Fa",
    );

    expect(init).toEqual({
      method: "GET",
      headers: {
        Authorization: "Bearer test-token",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    expect(init).not.toHaveProperty("body");
  });

  it("serializes JSON bodies without changing their contents", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const body = {
      status: "interviewing",
      notes: "Interview on Friday",
      expected: {
        id: "application-a",
        updatedAt: "2026-10-11T01:00:00.000Z",
      },
    };

    await apiRequest({
      path: "/api/applications/job-a",
      token: "test-token",
      method: "PATCH",
      body,
      signal: new AbortController().signal,
    });

    const [, init] = fetchMock.mock.calls[0]!;

    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toEqual({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(init?.body).toBe(JSON.stringify(body));
  });

  it("supports the SmartMatch stream accept header", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    await apiRequest({
      path: "/api/smart-match/ask",
      token: "test-token",
      method: "POST",
      body: { jobId: "job-a", question: "What does this role involve?" },
      accept: "application/x-ndjson",
      signal: new AbortController().signal,
    });

    const [, init] = fetchMock.mock.calls[0]!;

    expect(init?.headers).toEqual({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    });
  });

  it.each([204, 403, 409, 503])(
    "leaves HTTP %s handling to the caller",
    async (status) => {
      const response = new Response(null, { status });
      const readJson = vi.spyOn(response, "json");

      fetchMock.mockResolvedValueOnce(response);

      await expect(
        apiRequest({
          path: "/api/applications/job-a",
          token: "test-token",
          signal: new AbortController().signal,
        }),
      ).resolves.toBe(response);

      expect(readJson).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("propagates network failures without retrying", async () => {
    const failure = new Error("Network unavailable");
    fetchMock.mockRejectedValueOnce(failure);

    await expect(
      apiRequest({
        path: "/api/saved-jobs",
        token: "test-token",
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(failure);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
