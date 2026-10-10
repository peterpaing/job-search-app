"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type SyncError = {
  sessionId: string;
  message: string;
};

export default function AccountSync() {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();

  const [syncError, setSyncError] = useState<SyncError | null>(null);
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
  }, [isLoaded, isSignedIn, userId, sessionId, getToken, retryCount]);

  if (
    !isLoaded ||
    !isSignedIn ||
    !sessionId ||
    syncError?.sessionId !== sessionId
  ) {
    return null;
  }

  return (
    <div className="bg-background px-4 pt-4 sm:px-6 lg:px-8">
      <div
        role="alert"
        className="border-border bg-surface mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
      >
        <p className="text-muted text-sm">{syncError.message}</p>

        <button
          type="button"
          onClick={() => setRetryCount((count) => count + 1)}
          className="text-primary focus-visible:outline-primary rounded-full px-4 py-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
