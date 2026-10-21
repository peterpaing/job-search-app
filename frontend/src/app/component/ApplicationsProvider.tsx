"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
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
import ApplicationFeedback from "./ApplicationFeedback";
import {
  persistVisits,
  restoreVisits,
  storageKeyFor,
} from "../lib/application-visits.storage";
import { requestApplications } from "../lib/applications.request";
import type {
  Application,
  ApplicationUpdate,
  PendingVisit,
} from "../lib/applications.types";

export type { Application, ApplicationStatus } from "../lib/applications.types";
import { readOwnedSessionToken } from "../lib/owned-session-token";

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
    if (!signedIn) {
      return null;
    }

    return readOwnedSessionToken(clerk, userId, sessionId);
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
    async (path = "", method = "GET", body?: ApplicationUpdate) =>
      requestApplications({
        path,
        method,
        body,
        signedIn,
        getToken,
        isActive: () => mounted.current,
      }),
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

      <ApplicationFeedback
        showPrompt={Boolean(showPrompt)}
        candidate={candidate}
        signedIn={signedIn}
        busy={busy}
        error={error}
        notice={notice}
        onDismiss={dismiss}
        onTrack={track}
        onRememberYes={rememberYes}
        onDismissNotice={() => setNotice(null)}
      />
    </ApplicationsContext.Provider>
  );
}
