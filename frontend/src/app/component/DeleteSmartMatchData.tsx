"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";
import { FiTrash2 } from "react-icons/fi";

const secondaryButtonClass =
  "border-border text-primary hover:bg-surface focus-visible:outline-primary inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

export default function DeleteSmartMatchData() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();

  if (!isLoaded || !isSignedIn || !userId || !sessionId) {
    return null;
  }

  return (
    <DeletionControl
      key={`${userId}:${sessionId}`}
      userId={userId}
      sessionId={sessionId}
    />
  );
}

function DeletionControl({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) {
  const clerk = useClerk();
  const id = useId();

  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const activeController = useRef<AbortController | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      activeController.current?.abort();
    };
  }, []);

  function isCurrentAccount() {
    return (
      mounted.current &&
      clerk.user?.id === userId &&
      clerk.session?.id === sessionId
    );
  }

  function openConfirmation() {
    if (pending.current || !isCurrentAccount()) return;

    setError(null);
    setNotice(null);

    dialog.current?.showModal();
    cancelButton.current?.focus();
  }

  async function deleteData() {
    if (pending.current || !isCurrentAccount()) return;

    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);

    const controller = new AbortController();
    activeController.current = controller;

    const timer = setTimeout(() => controller.abort(), 30_000);

    function ensureCurrent() {
      if (!isCurrentAccount()) {
        throw new Error("Your account changed. Please try again.");
      }

      controller.signal.throwIfAborted();
    }

    try {
      const session = clerk.session;

      if (!session || session.id !== sessionId) {
        throw new Error("Please sign in again.");
      }

      const token = await session.getToken({ skipCache: true });
      ensureCurrent();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch(
        new URL(
          "/api/smart-match/profile",
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
        ),
        {
          method: "DELETE",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const result: unknown = await response.json();
      ensureCurrent();

      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "message" in result &&
          typeof result.message === "string"
            ? result.message
            : "Unable to delete your SmartMatch data. Please try again.";

        throw new Error(message);
      }

      if (
        typeof result !== "object" ||
        result === null ||
        !("profile" in result) ||
        result.profile !== null
      ) {
        throw new Error("Unable to confirm deletion. Please try again.");
      }

      dialog.current?.close();

      setNotice("Your SmartMatch profile and cached AI results were deleted.");
    } catch (failure) {
      if (isCurrentAccount()) {
        setError(
          controller.signal.aborted
            ? "The request timed out. Deletion may have completed. Please try again to confirm."
            : failure instanceof Error
              ? failure.message
              : "Unable to confirm deletion. Please try again.",
        );
      }
    } finally {
      clearTimeout(timer);

      if (activeController.current === controller) {
        activeController.current = null;
      }

      pending.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <div className="border-border rounded-2xl border p-5 sm:p-6">
      <h3 className="text-sm font-semibold">Delete SmartMatch data</h3>

      <p className="text-muted mt-2 text-sm leading-relaxed">
        Remove your saved developer profile and cached AI results. Your account,
        saved jobs, applications, and subscription stay unchanged. Usage and
        accounting records are retained.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={openConfirmation}
        className={`${secondaryButtonClass} mt-5`}
      >
        <FiTrash2 aria-hidden="true" className="h-4 w-4" />
        Delete SmartMatch data
      </button>

      {notice && (
        <p role="status" className="text-muted mt-3 text-sm">
          {notice}
        </p>
      )}

      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        aria-busy={busy}
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
        }}
        className="application-delete-dialog border-border bg-background text-primary fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border p-6 shadow-xl sm:p-8"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700">
          <FiTrash2 aria-hidden="true" className="h-5 w-5" />
        </div>

        <h2
          id={`${id}-title`}
          className="mt-5 text-center text-xl font-semibold"
        >
          Delete SmartMatch data?
        </h2>

        <p
          id={`${id}-description`}
          className="text-muted mt-4 text-center text-sm leading-relaxed"
        >
          This deletes your saved developer profile and cached AI results. Saved
          jobs, applications, and your subscription stay unchanged. Usage and
          accounting records are retained.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 text-center text-sm leading-relaxed text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={cancelButton}
            type="button"
            disabled={busy}
            onClick={() => dialog.current?.close()}
            className={secondaryButtonClass}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteData()}
            className="rounded-full bg-rose-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete data"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
