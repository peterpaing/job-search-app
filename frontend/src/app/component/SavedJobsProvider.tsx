"use client";

import { useAuth } from "@clerk/nextjs";
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

export type SavedJob = Job & {
  savedAt: string;
  isActive: boolean;
};

type SavedJobsContextValue = {
  signedIn: boolean;
  ready: boolean;
  savedJobs: SavedJob[];
  pendingJobIds: string[];
  error: string | null;
  actionError: string | null;
  reload: () => Promise<void>;
  setSaved: (job: Job, saved: boolean) => Promise<void>;
};

const SavedJobsContext = createContext<SavedJobsContextValue | null>(null);

type GetToken = ReturnType<typeof useAuth>["getToken"];

function sortSavedJobs(jobs: SavedJob[]) {
  return [...jobs].sort(
    (first, second) =>
      Date.parse(second.savedAt) - Date.parse(first.savedAt) ||
      first.id.localeCompare(second.id),
  );
}

function SignedInSavedJobsProvider({
  children,
  getToken,
}: {
  children: ReactNode;
  getToken: GetToken;
}) {
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [pendingJobIds, setPendingJobIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const mounted = useRef(true);
  const savedJobsRef = useRef<SavedJob[]>([]);
  const pendingJobs = useRef(new Set<string>());
  const mutationVersion = useRef(0);

  const updateSavedJobs = useCallback(
    (update: (current: SavedJob[]) => SavedJob[]) => {
      const next = update(savedJobsRef.current);

      savedJobsRef.current = next;
      setSavedJobs(next);
    },
    [],
  );

  const request = useCallback(
    async (path = "", method = "GET") => {
      const token = await getToken();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const url = new URL(
        `/api/saved-jobs${path}`,
        process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
      );

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error("Saved jobs request failed");
      }

      return response;
    },
    [getToken],
  );

  const loadSavedJobs = useCallback(async () => {
    const response = await request();
    const data = (await response.json()) as {
      jobs: SavedJob[];
    };

    if (!Array.isArray(data.jobs)) {
      throw new Error("Invalid saved jobs response");
    }

    return data.jobs;
  }, [request]);

  const reload = useCallback(async () => {
    const version = mutationVersion.current;

    try {
      const jobs = await loadSavedJobs();

      if (
        !mounted.current ||
        version !== mutationVersion.current ||
        pendingJobs.current.size > 0
      ) {
        return;
      }

      updateSavedJobs(() => jobs);
      setError(null);
      setActionError(null);
      setStatus("ready");
    } catch {
      if (mounted.current) {
        setError("Couldn’t load saved jobs. Please try again.");
        setStatus("error");
      }
    }
  }, [loadSavedJobs, updateSavedJobs]);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    const version = mutationVersion.current;

    void loadSavedJobs()
      .then((jobs) => {
        if (
          cancelled ||
          version !== mutationVersion.current ||
          pendingJobs.current.size > 0
        ) {
          return;
        }

        updateSavedJobs(() => jobs);
        setError(null);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setError("Couldn’t load saved jobs. Please try again.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [loadSavedJobs, updateSavedJobs]);

  const setSaved = useCallback(
    async (job: Job, saved: boolean) => {
      if (status !== "ready" || pendingJobs.current.has(job.id)) {
        return;
      }

      const previous = savedJobsRef.current.find((item) => item.id === job.id);

      pendingJobs.current.add(job.id);
      mutationVersion.current += 1;

      setPendingJobIds([...pendingJobs.current]);
      setActionError(null);

      // Update the UI immediately, before waiting for the API.
      if (saved) {
        const optimisticJob: SavedJob = previous ?? {
          ...job,
          savedAt: new Date().toISOString(),
          isActive: true,
        };

        updateSavedJobs((current) =>
          sortSavedJobs([
            optimisticJob,
            ...current.filter((item) => item.id !== job.id),
          ]),
        );
      } else {
        updateSavedJobs((current) =>
          current.filter((item) => item.id !== job.id),
        );
      }

      try {
        const response = await request(
          `/${encodeURIComponent(job.id)}`,
          saved ? "PUT" : "DELETE",
        );

        if (saved) {
          const data = (await response.json()) as {
            savedJob: SavedJob;
          };

          if (!data.savedJob || data.savedJob.id !== job.id) {
            throw new Error("Invalid saved job response");
          }

          if (mounted.current) {
            // Replace temporary data with the confirmed server record.
            updateSavedJobs((current) =>
              sortSavedJobs([
                data.savedJob,
                ...current.filter((item) => item.id !== job.id),
              ]),
            );
          }
        }
      } catch {
        if (mounted.current) {
          // Restore only this job; preserve changes to other jobs.
          updateSavedJobs((current) => {
            const remaining = current.filter((item) => item.id !== job.id);

            return previous
              ? sortSavedJobs([previous, ...remaining])
              : remaining;
          });

          setActionError(
            `Couldn’t confirm the change to “${job.title}”. The previous view was restored. Refresh saved jobs to check its status.`,
          );
        }
      } finally {
        pendingJobs.current.delete(job.id);

        if (mounted.current) {
          setPendingJobIds([...pendingJobs.current]);
        }
      }
    },
    [request, status, updateSavedJobs],
  );

  return (
    <SavedJobsContext.Provider
      value={{
        signedIn: true,
        ready: status === "ready",
        savedJobs,
        pendingJobIds,
        error,
        actionError,
        reload,
        setSaved,
      }}
    >
      {children}
    </SavedJobsContext.Provider>
  );
}

export default function SavedJobsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn, sessionId, getToken } = useAuth();

  if (!isLoaded || !isSignedIn || !sessionId) {
    return (
      <SavedJobsContext.Provider
        value={{
          signedIn: false,
          ready: isLoaded,
          savedJobs: [],
          pendingJobIds: [],
          error: null,
          actionError: null,
          reload: async () => {},
          setSaved: async () => {},
        }}
      >
        {children}
      </SavedJobsContext.Provider>
    );
  }

  return (
    <SignedInSavedJobsProvider key={sessionId} getToken={getToken}>
      {children}
    </SignedInSavedJobsProvider>
  );
}

export function useSavedJobs() {
  const context = useContext(SavedJobsContext);

  if (!context) {
    throw new Error("useSavedJobs must be used inside SavedJobsProvider");
  }

  return context;
}

export function SavedJobsNotice() {
  const { actionError, pendingJobIds, reload } = useSavedJobs();

  if (!actionError) {
    return null;
  }

  return (
    <div className="bg-background px-4 pt-4 sm:px-6 lg:px-8">
      <div
        role="alert"
        className="border-border bg-surface mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
      >
        <p className="text-muted min-w-0 flex-1 text-sm">{actionError}</p>

        <button
          type="button"
          onClick={() => void reload()}
          disabled={pendingJobIds.length > 0}
          className="text-primary focus-visible:outline-primary rounded-full px-3 py-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        >
          Refresh saved jobs
        </button>
      </div>
    </div>
  );
}
