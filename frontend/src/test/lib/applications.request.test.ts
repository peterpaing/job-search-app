import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestApplications } from "../../app/lib/applications.request";
import type { ApplicationUpdate } from "../../app/lib/applications.types";

const fetchMock = vi.fn<typeof fetch>();
const getToken = vi.fn<() => Promise<string | null>>();

let active = true;

function options() {
  return {
    signedIn: true,
    getToken,
    isActive: () => active,
  };
}

function respond(status: number) {
  const response = new Response(null, { status });
  fetchMock.mockResolvedValueOnce(response);
  return response;
}

beforeEach(() => {
  active = true;
  fetchMock.mockReset();
  getToken.mockReset();
  getToken.mockResolvedValue("session-token");

  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("application requests", () => {
  it("sends an authenticated uncached request without a body by default", async () => {
    const response = respond(200);

    await expect(requestApplications(options())).resolves.toBe(response);

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(String(url)).toBe("https://api.example.com/api/applications");

    expect(init).toMatchObject({
      method: "GET",
      headers: {
        Authorization: "Bearer session-token",
      },
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });

    expect(init).not.toHaveProperty("body");
  });

  it("preserves the update body and stale-save version", async () => {
    respond(200);

    const body: ApplicationUpdate = {
      status: "interviewing",
      notes: "Interview on Friday",
      expected: {
        id: "application-a",
        updatedAt: "2026-10-11T01:00:00.000Z",
      },
    };

    await requestApplications({
      ...options(),
      path: "/job%2Fa",
      method: "PATCH",
      body,
    });

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(String(url)).toBe(
      "https://api.example.com/api/applications/job%2Fa",
    );

    expect(init?.headers).toEqual({
      Authorization: "Bearer session-token",
      "Content-Type": "application/json",
    });

    expect(init?.body).toBe(JSON.stringify(body));
  });

  it("does not obtain a token or fetch for an inactive session", async () => {
    active = false;

    await expect(requestApplications(options())).rejects.toThrow(
      "This application session is no longer active.",
    );

    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch while signed out", async () => {
    await expect(
      requestApplications({
        ...options(),
        signedIn: false,
      }),
    ).rejects.toThrow("This application session is no longer active.");

    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch when the session becomes inactive during token retrieval", async () => {
    getToken.mockImplementationOnce(async () => {
      active = false;
      return "old-session-token";
    });

    await expect(requestApplications(options())).rejects.toThrow(
      "This application session is no longer active.",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch without a token", async () => {
    getToken.mockResolvedValueOnce(null);

    await expect(requestApplications(options())).rejects.toThrow(
      "Sign in to manage applications.",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns PATCH conflicts for the provider to handle", async () => {
    const response = respond(409);

    await expect(
      requestApplications({
        ...options(),
        path: "/job-a",
        method: "PATCH",
      }),
    ).resolves.toBe(response);
  });

  it("does not treat non-PATCH conflicts as successful responses", async () => {
    respond(409);

    await expect(
      requestApplications({
        ...options(),
        path: "/job-a",
        method: "PUT",
      }),
    ).rejects.toThrow(
      "We couldn’t confirm the change. Try again or refresh your applications.",
    );
  });

  it("preserves the unavailable-listing message when tracking returns 404", async () => {
    respond(404);

    await expect(
      requestApplications({
        ...options(),
        path: "/job-a",
        method: "PUT",
      }),
    ).rejects.toThrow("This listing is no longer available to track.");
  });

  it("returns a successful empty deletion response unchanged", async () => {
    const response = respond(204);

    await expect(
      requestApplications({
        ...options(),
        path: "/job-a",
        method: "DELETE",
      }),
    ).resolves.toBe(response);
  });

  it("propagates network failures", async () => {
    const failure = new Error("Network unavailable");

    fetchMock.mockRejectedValueOnce(failure);

    await expect(requestApplications(options())).rejects.toBe(failure);
  });
});
