"use client";

import { SignInButton, useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Job } from "./JobCard";

export type ApplicationStatus =
  "applied" | "interviewing" | "offered" | "rejected";

export type Application = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  url: string;
  status: ApplicationStatus;
  notes: string;
  appliedAt: string;
  updatedAt: string;
};

type VisitedJob = Pick<Job, "id" | "title" | "company"> & {
  url?: string;
};

type PendingVisit = {
  job: VisitedJob;
  confirmed: boolean;
};

type ApplicationUpdate = {
  status?: ApplicationStatus;
  notes?: string;
  expected?: {
    id: string;
    updatedAt: string;
  };
};

type ApplicationsContextValue = {
  signedIn: boolean;
  ready: boolean;
  applications: Application[];
  busy: boolean;
  error: string | null;
  recordVisit: (job: Job) => void;
  reload: () => Promise<void>;
  track: (jobId: string) => Promise<boolean>;
  update: (jobId: string, changes: ApplicationUpdate) => Promise<boolean>;
  remove: (jobId: string) => Promise<boolean>;
};

const ApplicationsContext = createContext<ApplicationsContextValue | null>(
  null,
);

const LEGACY_STORAGE_KEY = "dev-jobs:pending-application-visits:v1";

const GUEST_STORAGE_KEY = "dev-jobs:pending-application-visits:v2:guest";

function storageKeyFor(userId: string | null) {
  return userId
    ? `dev-jobs:pending-application-visits:v2:user:${encodeURIComponent(userId)}`
    : GUEST_STORAGE_KEY;
}

function readVisits(storageKey: string): PendingVisit[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "[]",
    );

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is PendingVisit => {
        if (!entry || typeof entry !== "object") {
          return false;
        }

        const candidate = entry as Partial<PendingVisit>;
        const job = candidate.job;

        return (
          typeof candidate.confirmed === "boolean" &&
          !!job &&
          typeof job.id === "string" &&
          typeof job.title === "string" &&
          typeof job.company === "string" &&
          (job.url === undefined || typeof job.url === "string")
        );
      })
      .slice(-10);
  } catch {
    return [];
  }
}

function persistVisits(storageKey: string, visits: PendingVisit[]): boolean {
  try {
    if (visits.length === 0) {
      sessionStorage.removeItem(storageKey);
    } else {
      sessionStorage.setItem(storageKey, JSON.stringify(visits));
    }

    return true;
  } catch {
    // In-memory prompts still work without browser storage.
    return false;
  }
}

function restoreVisits(userId: string | null): PendingVisit[] {
  // Legacy entries have no account owner. Never replay them.
  try {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // The legacy key is never read even if removal fails.
  }

  const storageKey = storageKeyFor(userId);
  const ownedVisits = readVisits(storageKey);

  if (!userId) {
    return ownedVisits;
  }

  // Only an explicit guest Yes can continue after sign-in.
  const guestChoices = readVisits(GUEST_STORAGE_KEY).filter(
    (visit) => visit.confirmed,
  );

  // Consume guest choices before starting any network request.
  // Another account must not claim the same choices.
  try {
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // Fail closed if guest choices cannot be consumed safely.
    return ownedVisits;
  }

  const merged = [
    ...ownedVisits,
    ...guestChoices.filter(
      (guest) => !ownedVisits.some((owned) => owned.job.id === guest.job.id),
    ),
  ].slice(-10);

  persistVisits(storageKey, merged);

  return merged;
}

function sortApplications(records: Application[]) {
  return [...records].sort(
    (a, b) =>
      Date.parse(b.appliedAt) - Date.parse(a.appliedAt) ||
      a.jobId.localeCompare(b.jobId),
  );
}

export function useApplications() {
  const context = useContext(ApplicationsContext);

  if (!context) {
    throw new Error("useApplications must be used inside ApplicationsProvider");
  }

  return context;
}

export function useApplicationVisit() {
  return useContext(ApplicationsContext)?.recordVisit;
}

export default function ApplicationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const clerk = useClerk();

  const identityReady = isLoaded && (!isSignedIn || (!!userId && !!sessionId));

  const signedIn = identityReady && !!isSignedIn && !!userId && !!sessionId;

  const getSessionToken = useCallback(async () => {
    const session = clerk.session;

    if (
      !signedIn ||
      !session ||
      session.id !== sessionId ||
      clerk.user?.id !== userId
    ) {
      return null;
    }

    // This resource belongs to the captured session.
    const token = await session.getToken();

    // Account switching may happen while token retrieval is pending.
    if (clerk.session?.id !== sessionId || clerk.user?.id !== userId) {
      return null;
    }

    return token;
  }, [clerk, sessionId, signedIn, userId]);

  return (
    <ApplicationSession
      key={signedIn ? JSON.stringify([userId, sessionId]) : "signed-out"}
      loaded={identityReady}
      signedIn={signedIn}
      userId={signedIn ? (userId ?? null) : null}
      getToken={getSessionToken}
    >
      {children}
    </ApplicationSession>
  );
}

function ApplicationSession({
  children,
  loaded,
  signedIn,
  userId,
  getToken,
}: {
  children: ReactNode;
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
}) {
  const storageKey = storageKeyFor(userId);

  const [applications, setApplications] = useState<Application[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visits, setVisits] = useState<PendingVisit[]>([]);
  const [returned, setReturned] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mounted = useRef(false);
  const busyRef = useRef(false);
  const visitsRef = useRef<PendingVisit[]>([]);
  const leftTab = useRef(false);

  const replaceVisits = useCallback(
    (next: PendingVisit[]) => {
      visitsRef.current = next;
      persistVisits(storageKey, next);
      setVisits(next);
    },
    [storageKey],
  );

  const dismiss = useCallback(
    (jobId: string) => {
      replaceVisits(
        visitsRef.current.filter((visit) => visit.job.id !== jobId),
      );
    },
    [replaceVisits],
  );

  const request = useCallback(
    async (path = "", method = "GET", body?: ApplicationUpdate) => {
      if (!mounted.current || !signedIn) {
        throw new Error("This application session is no longer active.");
      }

      const token = await getToken();

      if (!mounted.current) {
        throw new Error("This application session is no longer active.");
      }

      if (!token) {
        throw new Error("Sign in to manage applications.");
      }

      const response = await fetch(
        new URL(
          `/api/applications${path}`,
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
        ),
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        },
      );
      // Let update() handle a version conflict and its latest record.
      if (response.status === 409 && method === "PATCH") {
        return response;
      }
      if (!response.ok) {
        if (response.status === 404 && method === "PUT") {
          throw new Error("This listing is no longer available to track.");
        }

        throw new Error(
          "We couldn’t confirm the change. Try again or refresh your applications.",
        );
      }

      return response;
    },
    [getToken, signedIn],
  );

  const load = useCallback(async () => {
    const response = await request();

    const data = (await response.json()) as {
      applications: Application[];
    };

    if (!Array.isArray(data.applications)) {
      throw new Error("Unable to load applications.");
    }

    return sortApplications(data.applications);
  }, [request]);

  const mergeRecord = useCallback((record: Application) => {
    setApplications((current) =>
      sortApplications([
        ...current.filter((item) => item.jobId !== record.jobId),
        record,
      ]),
    );
  }, []);

  const reload = useCallback(async () => {
    if (!signedIn || !mounted.current || busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);

    try {
      const records = await load();

      if (mounted.current) {
        setApplications(records);
        setError(null);
        setReady(true);
      }
    } catch {
      if (mounted.current) {
        setError("We couldn’t load your applications. Please try again.");
        setReady(true);
      }
    } finally {
      busyRef.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }, [load, signedIn]);

  const track = useCallback(
    async (jobId: string) => {
      if (!signedIn || !ready || !mounted.current || busyRef.current) {
        return false;
      }

      const existing = applications.find(
        (application) => application.jobId === jobId,
      );

      if (existing) {
        dismiss(jobId);
        setNotice("This job is already in your applications.");
        return true;
      }

      const visit = visitsRef.current.find((entry) => entry.job.id === jobId);

      if (!visit) {
        setError(
          "We couldn’t find this listing. Open its job details and try again.",
        );
        return false;
      }

      busyRef.current = true;
      setBusy(true);
      setError(null);

      const now = new Date().toISOString();
      const temporaryId = `optimistic:${jobId}`;
      const savingNotice = "Application added. Saving in the background.";

      const optimisticApplication: Application = {
        id: temporaryId,
        jobId,
        title: visit.job.title,
        company: visit.job.company,
        url: visit.job.url ?? "",
        status: "applied",
        notes: "",
        appliedAt: now,
        updatedAt: now,
      };

      // Keep this account's Yes until the server confirms it.
      replaceVisits(
        visitsRef.current.map((entry) =>
          entry.job.id === jobId ? { ...entry, confirmed: true } : entry,
        ),
      );

      // Update the UI before token retrieval or network work.
      mergeRecord(optimisticApplication);
      setNotice(savingNotice);

      try {
        const response = await request(`/${encodeURIComponent(jobId)}`, "PUT");

        const data = (await response.json()) as {
          application: Application;
        };

        if (!data.application || data.application.jobId !== jobId) {
          throw new Error("Unexpected application response.");
        }

        if (!mounted.current) {
          return false;
        }

        mergeRecord(data.application);
        dismiss(jobId);

        // Do not reopen a notification already dismissed.
        setNotice((current) =>
          current === savingNotice ? "Added to your applications." : current,
        );

        return true;
      } catch (failure) {
        if (!mounted.current) {
          return false;
        }

        // Remove only this temporary application.
        setApplications((current) =>
          current.filter((application) => application.id !== temporaryId),
        );

        const restoredVisit: PendingVisit = {
          ...visit,
          confirmed: false,
        };

        const otherVisits = visitsRef.current.filter(
          (entry) => entry.job.id !== jobId,
        );

        replaceVisits([restoredVisit, ...otherVisits].slice(0, 10));

        setReturned(true);
        setNotice(null);

        const message = failure instanceof Error ? failure.message : "";

        setError(
          message === "This listing is no longer available to track."
            ? message
            : "We couldn’t confirm that your application was saved. The temporary entry was removed. Try again, or refresh applications to check its status.",
        );

        return false;
      } finally {
        busyRef.current = false;

        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [
      applications,
      dismiss,
      mergeRecord,
      ready,
      replaceVisits,
      request,
      signedIn,
    ],
  );

  const update = useCallback(
    async (jobId: string, changes: ApplicationUpdate) => {
      if (!signedIn || !mounted.current || busyRef.current) {
        return false;
      }

      busyRef.current = true;
      setBusy(true);
      setError(null);

      try {
        const response = await request(
          `/${encodeURIComponent(jobId)}`,
          "PATCH",
          changes,
        );

        const data = (await response.json()) as {
          application: Application;
        };

        if (!data.application || data.application.jobId !== jobId) {
          throw new Error("Unexpected application response.");
        }

        if (!mounted.current) {
          return false;
        }

        mergeRecord(data.application);

        if (response.status === 409) {
          setError(
            "This application changed before your save completed. Your draft is preserved. Review the latest version before saving again.",
          );
          return false;
        }

        return true;
      } catch {
        if (mounted.current) {
          setError(
            "We couldn’t save your changes. Your edits are still in the form.",
          );
        }

        return false;
      } finally {
        busyRef.current = false;

        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [mergeRecord, request, signedIn],
  );

  const remove = useCallback(
    async (jobId: string) => {
      if (!signedIn || !mounted.current || busyRef.current) {
        return false;
      }

      busyRef.current = true;
      setBusy(true);
      setError(null);

      try {
        await request(`/${encodeURIComponent(jobId)}`, "DELETE");

        if (!mounted.current) {
          return false;
        }

        setApplications((current) =>
          current.filter((item) => item.jobId !== jobId),
        );

        dismiss(jobId);
        return true;
      } catch {
        if (mounted.current) {
          setError(
            "We couldn’t confirm removal. Refresh your applications to check its status.",
          );
        }

        return false;
      } finally {
        busyRef.current = false;

        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [dismiss, request, signedIn],
  );

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    async function initialize() {
      await Promise.resolve();

      if (cancelled || !loaded) {
        return;
      }

      const storedVisits = restoreVisits(userId);

      visitsRef.current = storedVisits;
      setVisits(storedVisits);
      setReturned(storedVisits.length > 0);

      if (!signedIn) {
        setReady(true);
        return;
      }

      try {
        const records = await load();

        if (!cancelled) {
          setApplications(records);
          setReady(true);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setReady(true);
          setError("We couldn’t load your applications. Please try again.");
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [load, loaded, signedIn, userId]);

  // Resume only choices restored for the current account.
  useEffect(() => {
    if (!signedIn || !ready || error || busy) {
      return;
    }

    const confirmed = visits.find((visit) => visit.confirmed);

    if (!confirmed) {
      return;
    }

    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) {
        return track(confirmed.job.id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [busy, error, ready, signedIn, track, visits]);

  useEffect(() => {
    function leave() {
      leftTab.current = true;
    }

    function returnToTab() {
      if (document.visibilityState !== "visible" || !leftTab.current) {
        return;
      }

      leftTab.current = false;
      setReturned(true);
    }

    function visibilityChanged() {
      if (document.visibilityState === "hidden") {
        leave();
      } else {
        returnToTab();
      }
    }

    window.addEventListener("blur", leave);
    window.addEventListener("focus", returnToTab);
    document.addEventListener("visibilitychange", visibilityChanged);

    return () => {
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", returnToTab);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  const recordVisit = useCallback(
    (job: Job) => {
      if (!loaded || !ready || !mounted.current) {
        return;
      }

      if (
        applications.some((record) => record.jobId === job.id) ||
        visitsRef.current.some((visit) => visit.job.id === job.id)
      ) {
        return;
      }

      replaceVisits(
        [
          ...visitsRef.current,
          {
            job: {
              id: job.id,
              title: job.title,
              company: job.company,
              url: job.url,
            },
            confirmed: false,
          },
        ].slice(-10),
      );

      leftTab.current = false;
      setReturned(false);
      setNotice(null);
    },
    [applications, loaded, ready, replaceVisits],
  );

  const candidate = visits.find(
    (visit) =>
      !applications.some((application) => application.jobId === visit.job.id),
  );

  const showPrompt = loaded && ready && returned && candidate;

  function rememberYes() {
    if (!candidate) {
      return;
    }

    replaceVisits(
      visitsRef.current.map((visit) =>
        visit.job.id === candidate.job.id
          ? { ...visit, confirmed: true }
          : visit,
      ),
    );
  }

  return (
    <ApplicationsContext.Provider
      value={{
        signedIn,
        ready: loaded && ready,
        applications,
        busy,
        error,
        recordVisit,
        reload,
        track,
        update,
        remove,
      }}
    >
      {children}

      {showPrompt ? (
        <aside
          aria-labelledby="application-prompt-title"
          className="border-border bg-background fixed right-4 bottom-4 left-4 z-50 rounded-2xl border p-5 shadow-lg sm:left-auto sm:w-[380px]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="application-prompt-title"
                className="text-primary text-base font-semibold"
              >
                Did you apply for this job?
              </h2>

              <p className="text-muted mt-2 text-sm">
                {candidate.job.title} · {candidate.job.company}
              </p>
            </div>

            <button
              type="button"
              aria-label="Dismiss application question"
              disabled={busy}
              onClick={() => dismiss(candidate.job.id)}
              className="text-muted rounded-lg px-2 py-1 disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {!signedIn && candidate.confirmed ? (
            <p className="text-muted mt-3 text-sm">
              Sign in to add this job. We’ll keep your choice.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {signedIn ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void track(candidate.job.id)}
                className="bg-primary text-background rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Yes, I applied
              </button>
            ) : (
              <SignInButton mode="modal">
                <button
                  type="button"
                  onClick={rememberYes}
                  className="bg-primary text-background rounded-full px-4 py-2 text-sm font-medium"
                >
                  {candidate.confirmed
                    ? "Sign in to continue"
                    : "Yes, I applied"}
                </button>
              </SignInButton>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => dismiss(candidate.job.id)}
              className="border-border text-primary rounded-full border px-4 py-2 text-sm disabled:opacity-50"
            >
              Not yet
            </button>
          </div>
        </aside>
      ) : notice ? (
        <div
          role="status"
          className="border-border bg-background fixed right-4 bottom-4 left-4 z-50 flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-lg sm:left-auto"
        >
          <p className="text-primary text-sm">{notice}</p>

          <Link
            href="/tracker"
            onClick={() => setNotice(null)}
            className="text-primary text-sm font-medium underline underline-offset-4"
          >
            View application
          </Link>

          <button
            type="button"
            aria-label="Dismiss application notification"
            onClick={() => setNotice(null)}
            className="text-muted rounded-lg px-2 py-1"
          >
            ✕
          </button>
        </div>
      ) : null}
    </ApplicationsContext.Provider>
  );
}
