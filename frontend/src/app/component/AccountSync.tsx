"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { FiAlertCircle, FiRefreshCw, FiX } from "react-icons/fi";

type SyncError = {
  sessionId: string;
  message: string;
};

export default function AccountSync() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();

  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const [dismissedError, setDismissedError] = useState<SyncError | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId || !sessionId) {
      return;
    }

    const activeSessionId = sessionId;
    const controller = new AbortController();
    let cancelled = false;

    async function syncAccount() {
      try {
        const token = await getToken();

        if (cancelled) {
          return;
        }

        if (!token) {
          throw new Error("No active session token");
        }

        setSyncError(null);

        const apiUrl = new URL(
          "/api/users/me",
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
        );

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (cancelled) {
          return;
        }

        if (response.status === 410) {
          setSyncError(null);

          if (clerk.session?.id !== activeSessionId) {
            return;
          }

          try {
            await clerk.signOut({
              sessionId: activeSessionId,
            });
          } catch {
            // The deleted account's session may already be gone.
          }

          if (
            !cancelled &&
            (!clerk.session || clerk.session.id === activeSessionId)
          ) {
            window.location.replace(new URL("/", window.location.origin).href);
          }

          return;
        }
        if (!response.ok) {
          throw new Error(`Account sync failed: ${response.status}`);
        }

        if (!cancelled) {
          setSyncError(null);
        }
      } catch {
        if (cancelled) {
          return;
        }

        setSyncError({
          sessionId: activeSessionId,
          message:
            "We couldn’t connect your account. You can still browse jobs.",
        });
      }
    }

    void syncAccount();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isLoaded, isSignedIn, userId, sessionId, getToken, retryCount, clerk]);

  if (
    !isLoaded ||
    !isSignedIn ||
    !sessionId ||
    syncError?.sessionId !== sessionId ||
    dismissedError === syncError
  ) {
    return null;
  }

  return (
    <div
      role="alert"
      className="border-border bg-background fixed right-4 bottom-4 left-4 z-[60] mx-auto max-w-sm rounded-2xl border p-4 shadow-lg sm:left-auto sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"
        >
          <FiAlertCircle className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-primary text-sm font-semibold">
            Account connection interrupted
          </p>

          <p className="text-muted mt-1 text-xs leading-relaxed">
            {syncError.message}
          </p>

          <button
            type="button"
            onClick={() => {
              setDismissedError(null);
              setRetryCount((count) => count + 1);
            }}
            className="border-border text-primary focus-visible:outline-primary hover:bg-surface mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <FiRefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>

        <button
          type="button"
          aria-label="Dismiss account connection notice"
          onClick={() => setDismissedError(syncError)}
          className="text-muted focus-visible:outline-primary hover:bg-surface hover:text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <FiX aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
