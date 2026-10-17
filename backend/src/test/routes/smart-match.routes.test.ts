import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSmartMatchRouter } from "../../routes/smart-match.routes.js";
import { SmartMatchError } from "../../services/smart-match.logic.js";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getState: vi.fn(),
  storeProfile: vi.fn(),
  getJobs: vi.fn(),
  extract: vi.fn(),
  answer: vi.fn(),
  bootstrap: vi.fn(),
  hasPremium: vi.fn(),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  getAuth: mocks.getAuth,
}));

vi.mock("../../services/billing.service.js", () => ({
  hasPremium: mocks.hasPremium,
}));

vi.mock("../../services/smart-match.service.js", () => ({
  getSmartMatchState: mocks.getState,
  storeSmartMatchProfile: mocks.storeProfile,
  getSmartMatchJobs: mocks.getJobs,
  extractSmartMatchProfile: mocks.extract,
  answerSmartMatchQuestion: mocks.answer,
}));

vi.mock("../../services/smart-match-bootstrap.service.js", () => ({
  getSmartMatchBootstrap: mocks.bootstrap,
}));

vi.mock("../../services/account-deletion.state.js", () => ({
  assertAccountActive: vi.fn(async () => undefined),
  AccountDeletionError: class AccountDeletionError extends Error {},
}));

const app = express();
app.use(express.json());
app.use("/api/smart-match", createSmartMatchRouter("http://localhost:3000"));

const profile = {
  skills: ["React"],
  roles: ["Frontend Engineer"],
  experience: "mid",
  location: "",
  workMode: "any",
};

const endpoints = [
  ["get", "/profile"],
  ["put", "/profile"],
  ["delete", "/profile"],
  ["get", "/matches"],
  ["post", "/extract"],
  ["post", "/ask"],
] as const;

describe("SmartMatch routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "");
    vi.stubEnv("SMARTMATCH_AI_ENABLED", "false");
    vi.stubEnv("SMARTMATCH_USER_DAILY_LIMIT", "20");
    vi.stubEnv("SMARTMATCH_DAILY_BUDGET_CENTS", "500");

    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: "user_verified",
    });

    mocks.hasPremium.mockImplementation(
      async (clerkUserId: string) => clerkUserId === "user_verified",
    );

    mocks.getState.mockResolvedValue({
      profile: null,
      usage: { used: 0, limit: 20, remaining: 20 },
    });

    mocks.storeProfile.mockResolvedValue({ profile });
    mocks.getJobs.mockResolvedValue({ matches: [], searched: 0 });

    mocks.bootstrap.mockResolvedValue({
      profile,
      usage: {},
      matches: [],
      searched: 0,
    });

    mocks.extract.mockResolvedValue({ draft: profile });

    mocks.answer.mockResolvedValue({
      answer: "Review the React requirements.",
      cached: false,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated access checks", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app).get("/api/smart-match/access");

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("requires a verified user ID", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: true,
      userId: null,
    });

    const result = await request(app).get("/api/smart-match/profile");

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
    expect(mocks.getState).not.toHaveBeenCalled();
  });

  it("returns backend-owned premium access", async () => {
    const result = await request(app).get(
      "/api/smart-match/access?premium=false&userId=forged",
    );

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(true);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(result.headers["cache-control"]).toBe("no-store");
  });

  it("bootstraps only the verified identity, never a query-supplied user", async () => {
    const result = await request(app).get(
      "/api/smart-match/bootstrap?userId=forged&premium=true",
    );

    expect(result.status).toBe(200);
    expect(result.body.access.premium).toBe(true);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(mocks.bootstrap).toHaveBeenCalledWith("user_verified");
    expect(result.headers["cache-control"]).toBe("no-store");
  });

  it("does not read private bootstrap data for a non-premium user", async () => {
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get(
      "/api/smart-match/bootstrap?premium=true",
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      access: { premium: false },
      profile: null,
      usage: null,
      matches: [],
      searched: 0,
    });
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("requires authentication before bootstrap", async () => {
    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app).get("/api/smart-match/bootstrap");

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it.each(endpoints)("blocks non-premium %s %s", async (method, path) => {
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app)
      [method](`/api/smart-match${path}`)
      .send(profile);

    expect(result.status).toBe(403);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
    expect(mocks.getState).not.toHaveBeenCalled();
    expect(mocks.storeProfile).not.toHaveBeenCalled();
    expect(mocks.getJobs).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("reads profiles using verified identity", async () => {
    const result = await request(app).get(
      "/api/smart-match/profile?userId=forged",
    );

    expect(result.status).toBe(200);
    expect(mocks.getState).toHaveBeenCalledWith("user_verified");
  });

  it("saves a validated profile", async () => {
    const result = await request(app)
      .put("/api/smart-match/profile")
      .send(profile);

    expect(result.status).toBe(200);
    expect(mocks.storeProfile).toHaveBeenCalledWith("user_verified", profile);
  });

  it("rejects forged identity fields in a profile", async () => {
    const result = await request(app)
      .put("/api/smart-match/profile")
      .send({ ...profile, userId: "forged", premium: true });

    expect(result.status).toBe(400);
    expect(mocks.storeProfile).not.toHaveBeenCalled();
  });

  it("requires consent before resume extraction", async () => {
    const result = await request(app)
      .post("/api/smart-match/extract")
      .send({ resumeText: "React developer experience. ".repeat(5) });

    expect(result.status).toBe(400);
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("rejects oversized questions before calling AI", async () => {
    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "x".repeat(601) });

    expect(result.status).toBe(400);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("uses verified identity for AI questions", async () => {
    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "Explain my fit." });

    expect(result.status).toBe(200);
    expect(mocks.answer).toHaveBeenCalledWith(
      "user_verified",
      "job-a",
      "Explain my fit.",
      undefined,
    );
  });

  it("returns quota errors without turning them into generic failures", async () => {
    mocks.answer.mockRejectedValue(
      new SmartMatchError(429, "Daily AI limit reached."),
    );

    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "Explain my fit." });

    expect(result.status).toBe(429);
    expect(result.body.message).toBe("Daily AI limit reached.");
  });

  it("deletes only the authenticated user's SmartMatch data", async () => {
    const result = await request(app).delete(
      "/api/smart-match/profile?userId=forged",
    );

    expect(result.status).toBe(200);
    expect(mocks.storeProfile).toHaveBeenCalledWith("user_verified", null);
  });

  it("does not expose internal error details", async () => {
    mocks.getState.mockRejectedValue(
      new Error("Internal database credentials"),
    );

    const result = await request(app).get("/api/smart-match/profile");

    expect(result.status).toBe(500);
    expect(result.body.message).not.toContain("credentials");
  });

  it("grants the verified owner access without paid billing", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/access");

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(true);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("allows the owner to bootstrap without paid billing", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/bootstrap");

    expect(result.status).toBe(200);
    expect(result.body.access.premium).toBe(true);
    expect(mocks.bootstrap).toHaveBeenCalledWith("user_verified");
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("allows the owner through the protected profile middleware", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/profile");

    expect(result.status).toBe(200);
    expect(mocks.getState).toHaveBeenCalledWith("user_verified");
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("does not accept a query-supplied owner identity", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get(
      "/api/smart-match/access?userId=user_owner&owner=true",
    );

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(false);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
  });

  it("does not bootstrap a non-owner who supplies the owner ID", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get(
      "/api/smart-match/bootstrap?userId=user_owner&owner=true",
    );

    expect(result.status).toBe(200);
    expect(result.body.access.premium).toBe(false);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("still requires authentication for an owner-supplied query", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_owner");

    mocks.getAuth.mockReturnValue({
      isAuthenticated: false,
      userId: null,
    });

    const result = await request(app).get(
      "/api/smart-match/access?userId=user_owner",
    );

    expect(result.status).toBe(401);
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });

  it("does not grant owner access for malformed configuration", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "not-a-clerk-user");
    mocks.hasPremium.mockResolvedValue(false);

    const result = await request(app).get("/api/smart-match/access");

    expect(result.status).toBe(200);
    expect(result.body.premium).toBe(false);
    expect(mocks.hasPremium).toHaveBeenCalledWith("user_verified");
  });

  it("preserves global-budget errors for the owner", async () => {
    vi.stubEnv("SMARTMATCH_OWNER_CLERK_USER_ID", "user_verified");
    mocks.hasPremium.mockResolvedValue(false);

    mocks.answer.mockRejectedValue(
      new SmartMatchError(
        429,
        "AI has reached today’s service budget. Try again tomorrow.",
      ),
    );

    const result = await request(app)
      .post("/api/smart-match/ask")
      .send({ jobId: "job-a", question: "Explain my fit." });

    expect(result.status).toBe(429);
    expect(result.body.message).toBe(
      "AI has reached today’s service budget. Try again tomorrow.",
    );
    expect(mocks.hasPremium).not.toHaveBeenCalled();
  });
  describe("streamed job answers", () => {
    function streamRequest() {
      return request(app)
        .post("/api/smart-match/ask")
        .set("Accept", "application/x-ndjson")
        .buffer(true)
        .parse((response, done) => {
          let text = "";

          response.on("data", (chunk: Buffer) => {
            text += chunk.toString("utf8");
          });
          response.on("end", () => done(null, text));
          response.on("error", (error: Error) => done(error, null));
        });
    }

    function frames(body: unknown): Record<string, unknown>[] {
      return String(body)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    }

    it("returns ordered delta and done frames", async () => {
      const finalAnswer = {
        answer: "Highlight React experience.",
        cached: false,
        usage: { used: 1, limit: 20, remaining: 19 },
      };

      mocks.answer.mockImplementation(
        async (
          _userId: string,
          _jobId: string,
          _question: string,
          onDelta: (delta: string) => void,
        ) => {
          onDelta("Highlight ");
          onDelta("React experience.");
          return finalAnswer;
        },
      );

      const result = await streamRequest().send({
        jobId: "job-a",
        question: "Explain my fit.",
      });

      expect(result.status).toBe(200);
      expect(result.headers["content-type"]).toContain("application/x-ndjson");
      expect(result.headers["cache-control"]).toBe("no-store, no-transform");
      expect(result.headers["x-accel-buffering"]).toBe("no");

      expect(frames(result.body)).toEqual([
        { type: "delta", delta: "Highlight " },
        { type: "delta", delta: "React experience." },
        { type: "done", result: finalAnswer },
      ]);

      expect(mocks.answer).toHaveBeenCalledExactlyOnceWith(
        "user_verified",
        "job-a",
        "Explain my fit.",
        expect.any(Function),
      );
    });

    it("returns a cached answer as a done frame without fake deltas", async () => {
      const cached = {
        answer: "Cached answer.",
        cached: true,
        usage: {},
      };
      mocks.answer.mockResolvedValue(cached);

      const result = await streamRequest().send({
        jobId: "job-a",
        question: "Explain my fit.",
      });

      expect(frames(result.body)).toEqual([{ type: "done", result: cached }]);
    });

    it("preserves HTTP errors when failure occurs before streaming begins", async () => {
      mocks.answer.mockRejectedValue(
        new SmartMatchError(429, "Daily AI limit reached."),
      );

      const result = await request(app)
        .post("/api/smart-match/ask")
        .set("Accept", "application/x-ndjson")
        .send({
          jobId: "job-a",
          question: "Explain my fit.",
        });

      expect(result.status).toBe(429);
      expect(result.body).toEqual({
        message: "Daily AI limit reached.",
      });
    });

    it("sends an error frame instead of done after partial output fails", async () => {
      mocks.answer.mockImplementation(
        async (
          _userId: string,
          _jobId: string,
          _question: string,
          onDelta: (delta: string) => void,
        ) => {
          onDelta("Partial answer");
          throw new SmartMatchError(502, "Answer interrupted.");
        },
      );

      const result = await streamRequest().send({
        jobId: "job-a",
        question: "Explain my fit.",
      });

      // Headers were already sent with the first delta.
      expect(result.status).toBe(200);
      expect(frames(result.body)).toEqual([
        { type: "delta", delta: "Partial answer" },
        {
          type: "error",
          status: 502,
          message: "Answer interrupted.",
        },
      ]);
    });

    it("does not expose unexpected error details after streaming starts", async () => {
      mocks.answer.mockImplementation(
        async (
          _userId: string,
          _jobId: string,
          _question: string,
          onDelta: (delta: string) => void,
        ) => {
          onDelta("Partial");
          throw new Error("private provider credentials");
        },
      );

      const result = await streamRequest().send({
        jobId: "job-a",
        question: "Explain my fit.",
      });

      const output = frames(result.body);

      expect(output.at(-1)).toEqual({
        type: "error",
        status: 500,
        message: "AI couldn’t complete this request. Please try again later.",
      });
      expect(String(result.body)).not.toContain("credentials");
      expect(output.some((frame) => frame.type === "done")).toBe(false);
    });

    it("lets processing finish without writing to a disconnected client", async () => {
      let release!: () => void;
      let markClosed!: () => void;
      let responseRef: ServerResponse | undefined;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const closed = new Promise<void>((resolve) => {
        markClosed = resolve;
      });

      mocks.answer.mockImplementation(
        async (
          _userId: string,
          _jobId: string,
          _question: string,
          onDelta: (delta: string) => void,
        ) => {
          onDelta("First chunk");
          await gate;
          onDelta("Later chunk");

          return {
            answer: "First chunkLater chunk",
            cached: false,
            usage: {},
          };
        },
      );

      const server = createServer((req, res) => {
        responseRef = res;
        res.once("close", markClosed);
        app(req, res);
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });

      try {
        const address = server.address();

        if (!address || typeof address === "string") {
          throw new Error("Local test server did not start");
        }

        const incoming = await new Promise<IncomingMessage>(
          (resolve, reject) => {
            const client = httpRequest(
              {
                hostname: "127.0.0.1",
                port: address.port,
                path: "/api/smart-match/ask",
                method: "POST",
                headers: {
                  Accept: "application/x-ndjson",
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                response.on("error", () => undefined);
                response.once("data", () => resolve(response));
              },
            );

            client.on("error", reject);
            client.end(
              JSON.stringify({
                jobId: "job-a",
                question: "Explain my fit.",
              }),
            );
          },
        );

        if (!responseRef) {
          throw new Error("Missing server response");
        }

        const writesAfterFirstChunk = vi.spyOn(responseRef, "write");

        try {
          incoming.destroy();
          await closed;

          release();

          await vi.waitFor(() => {
            expect(mocks.answer.mock.settledResults[0]?.type).toBe("fulfilled");
          });

          expect(responseRef.destroyed).toBe(true);
          expect(writesAfterFirstChunk).not.toHaveBeenCalled();
          expect(mocks.answer).toHaveBeenCalledTimes(1);
        } finally {
          writesAfterFirstChunk.mockRestore();
        }
      } finally {
        release();
        server.closeAllConnections();

        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    }, 15_000);
  });
});
