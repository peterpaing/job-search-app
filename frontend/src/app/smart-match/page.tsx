"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaCrown } from "react-icons/fa";
import {
  FiCheck,
  FiFileText,
  FiRefreshCw,
  FiTrash2,
  FiUpload,
  FiZap,
} from "react-icons/fi";
import JobCard, { type Job } from "../component/JobCard";
import TagInput, { mergeTags } from "../component/TagInput";
import SmartMatchChat from "../component/SmartMatchChat";
import PremiumPreview from "../component/PremiumPreview";
import SmartMatchUsage, {
  type SmartMatchUsageData,
} from "../component/SmartMatchUsage";
import { readResumeFile } from "../lib/resume-file";

type Profile = {
  skills: string[];
  roles: string[];
  experience: "not-specified" | "junior" | "mid" | "senior";
  location: string;
  workMode: "any" | "remote" | "hybrid" | "on-site";
};

type Access = {
  premium: boolean;
  aiEnabled: boolean;
  dailyLimit: number;
};

type ProfileState = {
  profile: Profile | null;
  usage: SmartMatchUsageData;
};

type Match = {
  job: Job;
  matchedSkills: string[];
  strength: "strong" | "partial" | "related";
  workMode: "remote" | "hybrid" | "on-site" | "unknown";
};

type MatchesResponse = {
  matches: Match[];
  searched: number;
};

type BootstrapResponse = {
  access: Access;
  profile: Profile | null;
  usage: SmartMatchUsageData | null;
  matches: Match[];
  searched: number;
};

type ExtractionResponse = {
  draft: Profile;
  cached: boolean;
  usage: SmartMatchUsageData;
};

type AnswerResponse = {
  answer: string;
  cached: boolean;
  outOfScope?: boolean;
  usage: SmartMatchUsageData;
};

async function readAnswerStream<T>(
  response: Response,
  onDelta: (delta: string) => void,
  ensureCurrent: () => void,
): Promise<T> {
  if (!response.body) {
    throw new Error("SmartMatch couldn’t complete this request.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let receivedBytes = 0;

  function consumeLine(line: string): { result: T } | undefined {
    if (!line.trim()) {
      return;
    }

    const event: unknown = JSON.parse(line);

    if (typeof event !== "object" || event === null || !("type" in event)) {
      throw new Error("SmartMatch couldn’t complete this request.");
    }

    if (
      event.type === "delta" &&
      "delta" in event &&
      typeof event.delta === "string"
    ) {
      onDelta(event.delta);
      return;
    }

    if (
      event.type === "done" &&
      "result" in event &&
      typeof event.result === "object" &&
      event.result !== null &&
      "answer" in event.result &&
      typeof event.result.answer === "string" &&
      "cached" in event.result &&
      typeof event.result.cached === "boolean" &&
      "usage" in event.result
    ) {
      return { result: event.result as T };
    }

    if (event.type === "error") {
      const status =
        "status" in event && typeof event.status === "number"
          ? event.status
          : 502;

      const message =
        "message" in event && typeof event.message === "string"
          ? event.message
          : "AI couldn’t complete this request. Please try again later.";

      throw new SmartMatchRequestError(status, message);
    }

    throw new Error("SmartMatch couldn’t complete this request.");
  }

  try {
    while (true) {
      const chunk = await reader.read();
      ensureCurrent();

      if (chunk.done) {
        buffer += decoder.decode();
      } else {
        receivedBytes += chunk.value.byteLength;

        if (receivedBytes > 2_000_000) {
          throw new Error("SmartMatch couldn’t complete this request.");
        }

        buffer += decoder.decode(chunk.value, { stream: true });
      }

      let newline = buffer.indexOf("\n");

      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);

        const completed = consumeLine(line);

        if (completed) {
          return completed.result;
        }

        newline = buffer.indexOf("\n");
      }

      if (chunk.done) {
        if (buffer.trim()) {
          const completed = consumeLine(buffer);

          if (completed) {
            return completed.result;
          }
        }

        // A disconnected stream must not look like a finished answer.
        throw new Error(
          "AI couldn’t complete this request. Please try again later.",
        );
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

const emptyProfile: Profile = {
  skills: [],
  roles: [],
  experience: "not-specified",
  location: "",
  workMode: "any",
};

const buttonClass =
  "bg-primary text-background focus-visible:outline-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

const secondaryButtonClass =
  "border-border text-primary focus-visible:outline-primary inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

const inputClass =
  "border-border bg-background text-primary focus-visible:outline-primary mt-2 w-full rounded-xl border px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";

class SmartMatchRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SmartMatchRequestError";
  }
}

function waitForAccessRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Access check cancelled.", "AbortError"));
      return;
    }

    function cancel() {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);

      reject(new DOMException("Access check cancelled.", "AbortError"));
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 1500);

    signal.addEventListener("abort", cancel, {
      once: true,
    });
  });
}

async function readVerifiedSmartMatchAccess<T>(
  read: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal.aborted) {
      throw new DOMException("Access check cancelled.", "AbortError");
    }

    try {
      return await read();
    } catch (failure) {
      if (signal.aborted) throw failure;

      const retryable =
        failure instanceof SmartMatchRequestError
          ? failure.status === 409 ||
            failure.status === 429 ||
            failure.status >= 500
          : failure instanceof TypeError ||
            (failure instanceof DOMException && failure.name === "AbortError");

      if (!retryable || attempt === 3) {
        throw failure;
      }

      await waitForAccessRetry(signal);
    }
  }

  throw new Error("Your subscription could not be verified. Please try again.");
}

function LoadingPanel() {
  return (
    <div role="status" aria-label="Loading SmartMatch" aria-busy="true">
      <span className="sr-only">Loading SmartMatch…</span>

      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="bg-surface h-9 w-52 rounded-full" />
        <div className="bg-surface mt-5 h-5 w-3/4 rounded" />

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="border-border rounded-2xl border p-6">
              <div className="bg-surface h-7 w-28 rounded-full" />
              <div className="bg-surface mt-6 h-6 w-3/4 rounded" />
              <div className="bg-surface mt-4 h-4 w-1/2 rounded" />
              <div className="bg-surface mt-6 h-24 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SmartMatchWorkspace({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) {
  const clerk = useClerk();

  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile>(emptyProfile);
  const [skillsText, setSkillsText] = useState("");
  const [rolesText, setRolesText] = useState("");

  const [resumeText, setResumeText] = useState("");
  const [consent, setConsent] = useState(false);
  const [usage, setUsage] = useState<SmartMatchUsageData | null>(null);

  const [view, setView] = useState<"matches" | "profile">("profile");

  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [searched, setSearched] = useState(0);
  const [exceptionalOnly, setExceptionalOnly] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const mounted = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const operation = useRef(false);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const resumeFileInput = useRef<HTMLInputElement>(null);
  const chatTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    const activeControllers = controllers.current;

    return () => {
      mounted.current = false;

      for (const controller of activeControllers) {
        controller.abort();
      }

      activeControllers.clear();
    };
  }, []);

  const request = useCallback(
    async <T,>(
      path: string,
      method = "GET",
      body?: unknown,
      cancellation?: AbortSignal,
      onAnswerDelta?: (delta: string) => void,
    ): Promise<T> => {
      const session = clerk.session;

      function ensureCurrent() {
        if (
          cancellation?.aborted ||
          !mounted.current ||
          clerk.user?.id !== userId ||
          clerk.session?.id !== sessionId
        ) {
          throw new Error("Your account changed. Please try again.");
        }
      }

      ensureCurrent();

      if (session?.id !== sessionId) {
        throw new Error("Please sign in again.");
      }

      const token = await session.getToken();

      ensureCurrent();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const controller = new AbortController();
      controllers.current.add(controller);

      const timeout = setTimeout(() => controller.abort(), 45_000);

      try {
        const url = new URL(
          `/api/smart-match${path}`,
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
        );

        const response = await fetch(url, {
          method,
          cache: "no-store",
          signal: cancellation
            ? AbortSignal.any([controller.signal, cancellation])
            : controller.signal,

          headers: {
            Authorization: `Bearer ${token}`,

            ...(body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),

            ...(onAnswerDelta ? { Accept: "application/x-ndjson" } : {}),
          },

          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        ensureCurrent();

        if (!response.ok) {
          const value: unknown = await response.json();
          ensureCurrent();

          if (response.status === 403) {
            setAccess((previous) =>
              previous ? { ...previous, premium: false } : previous,
            );
          }

          const message =
            typeof value === "object" &&
            value !== null &&
            "message" in value &&
            typeof value.message === "string"
              ? value.message
              : "SmartMatch couldn’t complete this request.";

          throw new SmartMatchRequestError(response.status, message);
        }

        if (
          onAnswerDelta &&
          response.headers.get("content-type")?.includes("application/x-ndjson")
        ) {
          return await readAnswerStream<T>(
            response,
            (delta) => {
              ensureCurrent();
              onAnswerDelta(delta);
            },
            ensureCurrent,
          );
        }

        const value: unknown = await response.json();
        ensureCurrent();

        return value as T;
      } finally {
        clearTimeout(timeout);
        controllers.current.delete(controller);
      }
    },
    [clerk, sessionId, userId],
  );

  function applyDraft(value: Profile) {
    setDraft(value);
    setSkillsText("");
    setRolesText("");
  }

  useEffect(() => {
    let current = true;
    let running = false;
    let currentPremium = false;

    const cancellation = new AbortController();

    async function load(source: "initial" | "focus") {
      if (!current || running || operation.current) {
        return;
      }

      running = true;
      setError(null);

      // Never display the purchase preview while an unverified
      // or previously inactive account is being checked.
      if (source === "initial" || !currentPremium) {
        setLoading(true);
      }

      if (source === "initial") {
        setAccess(null);
      }

      try {
        if (source === "focus" && currentPremium) {
          // Recheck access without resetting the user's
          // unsaved profile, resume text, or selected view.
          const nextAccess = await readVerifiedSmartMatchAccess(
            () =>
              request<Access>("/access", "GET", undefined, cancellation.signal),
            cancellation.signal,
          );

          if (!current || cancellation.signal.aborted) {
            return;
          }

          currentPremium = nextAccess.premium;
          setAccess(nextAccess);

          if (!nextAccess.premium) {
            setSelectedJob(null);
          }

          return;
        }

        const state = await readVerifiedSmartMatchAccess(
          () =>
            request<BootstrapResponse>(
              "/bootstrap",
              "GET",
              undefined,
              cancellation.signal,
            ),
          cancellation.signal,
        );

        if (!current || cancellation.signal.aborted) {
          return;
        }

        currentPremium = state.access.premium;
        setAccess(state.access);

        if (!state.access.premium) {
          setSelectedJob(null);
          return;
        }

        setProfile(state.profile);
        setUsage(state.usage);
        setDraft(state.profile ?? emptyProfile);
        setSkillsText("");
        setRolesText("");
        setMatches(state.matches);
        setSearched(state.searched);

        setView(state.profile ? "matches" : "profile");
      } catch (failure) {
        if (current && mounted.current && !cancellation.signal.aborted) {
          // Verification errors are not proof that the user
          // needs to purchase Pro again.
          if (!currentPremium) {
            setAccess(null);
          }

          setError(
            failure instanceof Error
              ? failure.message
              : "Your subscription could not be verified. Please try again.",
          );
        }
      } finally {
        running = false;

        if (current && mounted.current && !cancellation.signal.aborted) {
          setLoading(false);
        }
      }
    }

    function recheckWhenVisible() {
      if (document.visibilityState !== "hidden") {
        void load("focus");
      }
    }

    // Avoid duplicate initial work during Strict Mode setup.
    queueMicrotask(() => {
      if (current) {
        void load("initial");
      }
    });

    window.addEventListener("focus", recheckWhenVisible);

    document.addEventListener("visibilitychange", recheckWhenVisible);

    return () => {
      current = false;
      cancellation.abort();

      window.removeEventListener("focus", recheckWhenVisible);

      document.removeEventListener("visibilitychange", recheckWhenVisible);
    };
  }, [request, retry]);

  async function run(action: () => Promise<void>) {
    if (operation.current) {
      return;
    }

    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await action();
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Something went wrong. Please try again.",
        );
      }
    } finally {
      operation.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  async function refreshMatches() {
    setMatchesLoading(true);

    try {
      const result = await request<MatchesResponse>("/matches");

      setMatches(result.matches);
      setSearched(result.searched);
    } finally {
      if (mounted.current) {
        setMatchesLoading(false);
      }
    }
  }

  async function refreshUsage() {
    const state = await request<ProfileState>("/profile");

    // Keep unsaved profile changes untouched.
    setUsage(state.usage);
    setNotice("Usage updated.");
  }

  function saveProfile() {
    void run(async () => {
      const value: Profile = {
        ...draft,
        skills: mergeTags(draft.skills, skillsText, 20, 60),
        roles: mergeTags(draft.roles, rolesText, 5, 80),
      };

      if (value.skills.length === 0) {
        throw new Error("Add at least one skill before saving.");
      }

      const state = await request<ProfileState>("/profile", "PUT", value);

      setProfile(state.profile);
      setUsage(state.usage);
      applyDraft(state.profile ?? emptyProfile);
      setSelectedJob(null);
      setMatches([]);
      setExceptionalOnly(false);
      setView("matches");
      setNotice("Profile saved.");

      await refreshMatches();

      if (mounted.current) {
        setNotice("Profile saved. Your matches have been refreshed.");
      }
    });
  }
  function loadResumeFile(file: File) {
    void run(async () => {
      const controller = new AbortController();
      controllers.current.add(controller);

      // A new file requires a fresh consent decision after review.
      setConsent(false);

      try {
        const text = await readResumeFile(file, controller.signal);

        if (
          !mounted.current ||
          controller.signal.aborted ||
          clerk.user?.id !== userId ||
          clerk.session?.id !== sessionId
        ) {
          return;
        }

        setResumeText(text);

        setNotice(
          `Loaded ${file.name}. Review the text and remove anything you don’t want to send before extraction.`,
        );
      } finally {
        controllers.current.delete(controller);
      }
    });
  }
  function extractResume() {
    void run(async () => {
      const result = await request<ExtractionResponse>("/extract", "POST", {
        resumeText,
        consent,
      });

      applyDraft(result.draft);
      setUsage(result.usage);
      setResumeText("");
      setConsent(false);

      setNotice(
        "Draft ready. Review your skills and preferences, then save your profile.",
      );
    });
  }

  function openJobChat(job: Job, trigger: HTMLButtonElement) {
    if (operation.current) {
      return;
    }

    chatTrigger.current = trigger;
    setSelectedJob(job);
  }

  function closeJobChat() {
    setSelectedJob(null);

    if (chatTrigger.current?.isConnected) {
      chatTrigger.current.focus();
    }
  }

  async function askJobQuestion(
    question: string,
    onDelta: (delta: string) => void,
  ): Promise<AnswerResponse> {
    const job = selectedJob;

    if (!job) {
      throw new Error("Choose a job first.");
    }

    if (operation.current) {
      throw new Error("Another request is running. Please wait.");
    }

    operation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await request<AnswerResponse>(
        "/ask",
        "POST",
        {
          jobId: job.id,
          question: question.trim(),
        },
        undefined,
        onDelta,
      );

      setUsage(result.usage);
      return result;
    } finally {
      operation.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  function removeData() {
    void run(async () => {
      const state = await request<ProfileState>("/profile", "DELETE");

      setProfile(null);
      setUsage(state.usage);
      applyDraft(emptyProfile);
      setResumeText("");
      setConsent(false);
      setMatches([]);
      setSearched(0);
      setExceptionalOnly(false);
      setSelectedJob(null);
      setView("profile");
      deleteDialog.current?.close();

      setNotice("Your SmartMatch profile and cached answers were deleted.");
    });
  }

  if (loading) {
    return <LoadingPanel />;
  }

  if (!access) {
    return (
      <div
        role="alert"
        className="border-border rounded-2xl border p-8 text-center"
      >
        <h1 className="text-primary text-xl font-semibold">
          Couldn’t load SmartMatch
        </h1>

        <p className="text-muted mt-3 text-sm">{error}</p>

        <button
          type="button"
          className={`${buttonClass} mt-6`}
          onClick={() => setRetry((value) => value + 1)}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!access.premium) {
    return <PremiumPreview signedIn />;
  }

  const visibleMatches = exceptionalOnly
    ? matches.filter((match) => match.strength === "strong")
    : matches;

  const hiddenByStrengthFilter =
    exceptionalOnly && matches.length > 0 && visibleMatches.length === 0;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <span className="bg-surface text-primary inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <FaCrown aria-hidden="true" />
            StackWing Pro
          </span>

          <h1 className="text-primary mt-4 text-3xl font-semibold tracking-tight">
            Your next role, with more clarity.
          </h1>

          <p className="text-muted mt-3 max-w-2xl text-sm leading-relaxed">
            Match your skills with real listings, then ask AI about the roles
            that interest you.
          </p>
        </div>

        {usage && (
          <SmartMatchUsage
            usage={usage}
            refreshDisabled={busy}
            onRefresh={() => void run(refreshUsage)}
          />
        )}
      </div>

      <nav
        aria-label="SmartMatch views"
        className="border-border mt-8 flex gap-2 border-b pb-5"
      >
        <button
          type="button"
          aria-pressed={view === "matches"}
          disabled={!profile || busy}
          onClick={() => setView("matches")}
          className={view === "matches" ? buttonClass : secondaryButtonClass}
        >
          Matches
        </button>

        <button
          type="button"
          aria-pressed={view === "profile"}
          disabled={busy}
          onClick={() => {
            setSelectedJob(null);
            setView("profile");
          }}
          className={view === "profile" ? buttonClass : secondaryButtonClass}
        >
          My profile
        </button>
      </nav>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      {notice && (
        <p
          role="status"
          className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <FiCheck aria-hidden="true" className="mt-0.5 shrink-0" />
          {notice}
        </p>
      )}

      {!access.aiEnabled && (
        <p className="bg-surface text-muted mt-6 rounded-xl p-4 text-sm">
          AI is temporarily unavailable. You can still update your profile and
          browse your matches.
        </p>
      )}

      {view === "profile" ? (
        <div className="mt-7 grid items-start gap-6 lg:grid-cols-2">
          <section className="border-border rounded-2xl border p-5 sm:p-7">
            <FiFileText aria-hidden="true" className="text-primary h-6 w-6" />

            <h2 className="text-primary mt-4 text-xl font-semibold">
              Start with your resume
            </h2>

            <p className="text-muted mt-3 text-sm leading-relaxed">
              Paste resume text or upload a .txt or text-based PDF. Review the
              text below and remove contact details or anything you don’t want
              to send to OpenAI.
            </p>

            <div className="mt-5">
              <p className="text-primary text-sm font-medium">Resume file</p>

              <input
                ref={resumeFileInput}
                id="resume-file"
                aria-label="Resume file"
                type="file"
                accept=".txt,.pdf,text/plain,application/pdf"
                disabled={busy}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  // Allow selecting the same file again after an error.
                  event.target.value = "";

                  if (file) {
                    loadResumeFile(file);
                  }
                }}
              />

              <button
                type="button"
                disabled={busy}
                onClick={() => resumeFileInput.current?.click()}
                className={`${secondaryButtonClass} mt-3`}
              >
                <FiUpload aria-hidden="true" />
                Upload resume (.txt or .pdf)
              </button>

              <p className="text-muted mt-2 text-xs">
                TXT up to 64 KB · PDF up to 2 MB and 10 pages. Text-based PDFs
                only; scanned PDFs are not supported.
              </p>
            </div>

            <label
              htmlFor="resume-text"
              className="text-primary mt-5 block text-sm font-medium"
            >
              Resume text
            </label>

            <textarea
              id="resume-text"
              value={resumeText}
              maxLength={16_000}
              disabled={busy}
              onChange={(event) => {
                setResumeText(event.target.value);
                setConsent(false);
              }}
              placeholder="Paste your relevant experience and technical skills…"
              className={`${inputClass} application-notes h-48 resize-none overflow-y-auto`}
            />

            <p className="text-muted mt-2 text-right text-xs">
              {resumeText.length.toLocaleString("en-US")} / 16,000
            </p>

            <label className="text-muted mt-5 flex items-start gap-3 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 accent-black"
              />
              I agree to send this text to OpenAI to extract a draft developer
              profile.
            </label>

            <button
              type="button"
              onClick={extractResume}
              disabled={
                busy ||
                !access.aiEnabled ||
                !consent ||
                resumeText.trim().length < 40
              }
              className={`${buttonClass} mt-6`}
            >
              <FiZap aria-hidden="true" />
              {busy ? "Working…" : "Extract with AI"}
            </button>

            <p className="text-muted mt-4 text-xs leading-relaxed">
              Files are read locally in your browser and are not uploaded to
              StackWing. Only the reviewed text is sent for AI extraction after
              you confirm consent and click Extract with AI. Raw resume text is
              not saved in StackWing’s database. Extracted drafts can be reused
              from your private cache for up to 24 hours; expired entries may
              remain until a new AI generation starts or you delete your
              SmartMatch data.
            </p>
          </section>

          <section className="border-border rounded-2xl border p-5 sm:p-7">
            <h2 className="text-primary text-xl font-semibold">
              Review your developer profile
            </h2>

            <p className="text-muted mt-3 text-sm leading-relaxed">
              You can enter everything manually. Saving this form does not use
              an AI generation.
            </p>

            <form
              className="mt-6 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                saveProfile();
              }}
            >
              <TagInput
                id="match-skills"
                label="Skills"
                values={draft.skills}
                inputValue={skillsText}
                onInputChange={setSkillsText}
                onChange={(skills) =>
                  setDraft((previous) => ({
                    ...previous,
                    skills,
                  }))
                }
                maxItems={20}
                maxItemLength={60}
                disabled={busy}
                placeholder="Add a skill, e.g. React"
              />

              <TagInput
                id="match-roles"
                label="Preferred roles"
                values={draft.roles}
                inputValue={rolesText}
                onInputChange={setRolesText}
                onChange={(roles) =>
                  setDraft((previous) => ({
                    ...previous,
                    roles,
                  }))
                }
                maxItems={5}
                maxItemLength={80}
                disabled={busy}
                placeholder="Add a role, e.g. Full Stack Developer"
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="match-experience"
                    className="text-primary text-sm font-medium"
                  >
                    Experience
                  </label>

                  <select
                    id="match-experience"
                    value={draft.experience}
                    disabled={busy}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        experience: event.target.value as Profile["experience"],
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="not-specified">Not specified</option>
                    <option value="junior">Junior</option>
                    <option value="mid">Mid-level</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="match-work-mode"
                    className="text-primary text-sm font-medium"
                  >
                    Work preference
                  </label>

                  <select
                    id="match-work-mode"
                    value={draft.workMode}
                    disabled={busy}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        workMode: event.target.value as Profile["workMode"],
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="any">Any</option>
                    <option value="remote">Remote preferred</option>
                    <option value="hybrid">Hybrid preferred</option>
                    <option value="on-site">On-site preferred</option>
                  </select>

                  <p className="text-muted mt-2 text-xs leading-relaxed">
                    Jobs with unknown work mode may appear. Verify their
                    requirements in the original listing.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="match-location"
                  className="text-primary text-sm font-medium"
                >
                  Preferred location
                </label>

                <input
                  id="match-location"
                  value={draft.location}
                  maxLength={100}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      location: event.target.value,
                    }))
                  }
                  placeholder="Country or city"
                  className={inputClass}
                />

                <p className="text-muted mt-2 text-xs">
                  A ranking preference, not confirmation of work eligibility.
                </p>
              </div>

              <button type="submit" disabled={busy} className={buttonClass}>
                <FiCheck aria-hidden="true" />
                {busy ? "Working…" : "Save profile and find matches"}
              </button>
            </form>

            <div className="border-border mt-7 border-t pt-5">
              <p className="text-muted text-xs leading-relaxed">
                Your saved profile and AI answers are private to your account.
                AI can make mistakes. Check important details in the original
                listing.
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  deleteDialog.current?.showModal();
                  cancelDelete.current?.focus();
                }}
                className="mt-4 inline-flex items-center gap-2 rounded text-sm font-medium text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <FiTrash2 aria-hidden="true" />
                Delete SmartMatch data
              </button>
            </div>
          </section>
        </div>
      ) : (
        <section className="mt-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-primary text-xl font-semibold">
                Your matched jobs
              </h2>

              <p className="text-muted mt-2 max-w-3xl text-xs leading-relaxed">
                Based on your profile and available listing details.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-muted flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exceptionalOnly}
                  onChange={(event) => setExceptionalOnly(event.target.checked)}
                  className="accent-black"
                />
                Exceptional matches only
              </label>

              <button
                type="button"
                disabled={busy || matchesLoading}
                onClick={() => void run(refreshMatches)}
                className={secondaryButtonClass}
              >
                <FiRefreshCw aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>

          {matchesLoading ? (
            <div className="mt-6">
              <LoadingPanel />
            </div>
          ) : visibleMatches.length === 0 ? (
            <div className="border-border mt-6 flex min-h-[340px] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center">
              <FiZap aria-hidden="true" className="text-muted h-7 w-7" />

              <h3 className="text-primary mt-5 text-xl font-semibold">
                {hiddenByStrengthFilter
                  ? "No exceptional matches yet"
                  : "No matching jobs yet"}
              </h3>

              <p className="text-muted mt-3 max-w-md text-sm">
                {hiddenByStrengthFilter
                  ? "Other matches are available. Clear this filter to see them."
                  : "The available listing details don’t show a match yet. Try broader roles or preferences, or browse all jobs."}
              </p>

              {hiddenByStrengthFilter ? (
                <button
                  type="button"
                  onClick={() => setExceptionalOnly(false)}
                  className={`${buttonClass} mt-6`}
                >
                  Show all matches
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedJob(null);
                    setView("profile");
                  }}
                  className={`${buttonClass} mt-6`}
                >
                  Edit profile
                </button>
              )}

              <Link href="/" className={`${secondaryButtonClass} mt-4`}>
                Explore all jobs
              </Link>
            </div>
          ) : (
            <>
              <p className="text-muted mt-6 text-sm">
                {visibleMatches.length} recommendations from {searched} recent
                listings
              </p>

              <div className="mt-5 grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleMatches.map((match) => (
                  <JobCard
                    key={match.job.id}
                    job={match.job}
                    matchDetails={{
                      strength: match.strength,
                      workMode: match.workMode ?? "unknown",
                      matchedSkills: match.matchedSkills,
                    }}
                    askDisabled={busy}
                    onAsk={(trigger) => openJobChat(match.job, trigger)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {selectedJob && (
        <SmartMatchChat
          key={selectedJob.id}
          job={selectedJob}
          aiEnabled={access.aiEnabled}
          disabled={busy}
          onAsk={askJobQuestion}
          onClose={closeJobChat}
        />
      )}

      <dialog
        ref={deleteDialog}
        aria-labelledby="delete-smart-match-title"
        aria-describedby="delete-smart-match-description"
        onCancel={(event) => {
          if (busy) {
            event.preventDefault();
          }
        }}
        className="application-delete-dialog border-border bg-background text-primary fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border p-6 shadow-xl sm:p-8"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700">
          <FiTrash2 aria-hidden="true" className="h-5 w-5" />
        </div>

        <h2
          id="delete-smart-match-title"
          className="mt-5 text-center text-xl font-semibold"
        >
          Delete SmartMatch data?
        </h2>

        <p
          id="delete-smart-match-description"
          className="text-muted mt-4 text-center text-sm leading-relaxed"
        >
          This deletes your saved developer profile and cached answers. Saved
          jobs and applications stay unchanged. Usage and accounting records are
          retained to enforce your allowances.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={cancelDelete}
            type="button"
            disabled={busy}
            onClick={() => deleteDialog.current?.close()}
            className={secondaryButtonClass}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={removeData}
            className="rounded-full bg-rose-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete data"}
          </button>
        </div>
      </dialog>
    </>
  );
}

export default function SmartMatchPage() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();

  return (
    <section className="bg-background min-h-[85svh] px-4 pt-10 pb-32 sm:px-6 sm:pt-12 sm:pb-40 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {!isLoaded ? (
          <LoadingPanel />
        ) : !isSignedIn || !userId || !sessionId ? (
          <PremiumPreview signedIn={false} />
        ) : (
          <SmartMatchWorkspace
            key={`${userId}:${sessionId}`}
            userId={userId}
            sessionId={sessionId}
          />
        )}
      </div>
    </section>
  );
}
