"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import type { PendingVisit } from "../lib/applications.types";
import { FiX } from "react-icons/fi";

type ApplicationFeedbackProps = {
  showPrompt: boolean;
  candidate: PendingVisit | undefined;
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onDismiss: (jobId: string) => void;
  onTrack: (jobId: string) => Promise<boolean>;
  onRememberYes: () => void;
  onDismissNotice: () => void;
};

export default function ApplicationFeedback({
  showPrompt,
  candidate,
  signedIn,
  busy,
  error,
  notice,
  onDismiss,
  onTrack,
  onRememberYes,
  onDismissNotice,
}: ApplicationFeedbackProps) {
  if (showPrompt && candidate) {
    return (
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
            onClick={() => onDismiss(candidate.job.id)}
            className="text-muted rounded-lg px-2 py-1 disabled:opacity-50"
          >
            <FiX aria-hidden="true" className="h-4 w-4" />
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
              onClick={() => void onTrack(candidate.job.id)}
              className="bg-primary text-background rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Yes, I applied
            </button>
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                onClick={onRememberYes}
                className="bg-primary text-background rounded-full px-4 py-2 text-sm font-medium"
              >
                {candidate.confirmed ? "Sign in to continue" : "Yes, I applied"}
              </button>
            </SignInButton>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => onDismiss(candidate.job.id)}
            className="border-border text-primary rounded-full border px-4 py-2 text-sm disabled:opacity-50"
          >
            Not yet
          </button>
        </div>
      </aside>
    );
  }

  if (!notice) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-border bg-background fixed right-4 bottom-4 left-4 z-50 flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-lg sm:left-auto"
    >
      <p className="text-primary text-sm">{notice}</p>

      <Link
        href="/tracker"
        onClick={onDismissNotice}
        className="text-primary text-sm font-medium underline underline-offset-4"
      >
        View application
      </Link>

      <button
        type="button"
        aria-label="Dismiss application notification"
        onClick={onDismissNotice}
        className="text-muted rounded-lg px-2 py-1"
      >
        <FiX aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
