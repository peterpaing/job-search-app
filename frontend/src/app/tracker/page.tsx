"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  FiAward,
  FiCheck,
  FiChevronDown,
  FiExternalLink,
  FiMessageCircle,
  FiSend,
  FiTrash2,
  FiXCircle,
} from "react-icons/fi";
import {
  useApplications,
  type Application,
  type ApplicationStatus,
} from "../component/ApplicationsProvider";

const statusStyles = {
  applied: {
    label: "Applied",
    badge: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-blue-500",
    accent: "bg-blue-400",
    icon: FiSend,
  },
  interviewing: {
    label: "Interviewing",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    accent: "bg-amber-400",
    icon: FiMessageCircle,
  },
  offered: {
    label: "Offered",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    accent: "bg-emerald-400",
    icon: FiAward,
  },
  rejected: {
    label: "Rejected",
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
    accent: "bg-rose-400",
    icon: FiXCircle,
  },
} satisfies Record<
  ApplicationStatus,
  {
    label: string;
    badge: string;
    dot: string;
    accent: string;
    icon: typeof FiSend;
  }
>;

const statuses: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offered",
  "rejected",
];

function ApplicationCard({ application }: { application: Application }) {
  const { busy, update, remove } = useApplications();

  const [status, setStatus] = useState(application.status);
  const [notes, setNotes] = useState(application.notes);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const changed = status !== application.status || notes !== application.notes;

  const statusId = `application-status-${application.id}`;
  const notesId = `application-notes-${application.id}`;
  const notesHelpId = `application-notes-help-${application.id}`;
  const dialogTitleId = `delete-title-${application.id}`;
  const dialogDescriptionId = `delete-description-${application.id}`;

  const currentStyle = statusStyles[application.status];
  const selectedStyle = statusStyles[status];
  const StatusIcon = currentStyle.icon;

  function openDeleteDialog() {
    setDeleteError(null);
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }

  function closeDeleteDialog() {
    if (!removing) {
      dialogRef.current?.close();
    }
  }

  async function saveChanges() {
    if (busy || saving || !changed) {
      return;
    }

    setSaving(true);
    setSaved(false);

    try {
      const success = await update(application.jobId, {
        status,
        notes,
      });

      if (success) {
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (busy || removing) {
      return;
    }

    setRemoving(true);
    setDeleteError(null);

    try {
      const success = await remove(application.jobId);

      if (success) {
        dialogRef.current?.close();
        document.getElementById("applications-heading")?.focus();
      } else {
        setDeleteError(
          "We couldn’t confirm removal. Try again, or cancel and refresh your applications.",
        );
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <article className="border-border bg-background flex h-full flex-col overflow-hidden rounded-2xl border">
      <div aria-hidden="true" className={`h-1 w-full ${currentStyle.accent}`} />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${currentStyle.badge}`}
          >
            <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {currentStyle.label}
          </span>

          <button
            type="button"
            disabled={busy}
            onClick={openDeleteDialog}
            aria-label={`Remove ${application.title} at ${application.company} from tracker`}
            title="Remove application"
            className="text-muted focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40"
          >
            <FiTrash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <p className="text-muted mt-5 text-sm">{application.company}</p>

        <h2 className="text-primary mt-2 text-lg leading-snug font-semibold">
          {application.title}
        </h2>

        <p className="text-muted mt-3 text-xs">
          Applied on{" "}
          <time dateTime={application.appliedAt}>
            {new Date(application.appliedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        </p>

        {application.url ? (
          <a
            href={application.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary focus-visible:outline-primary mt-4 inline-flex w-fit items-center gap-2 rounded text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Original listing
            <FiExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}

        <form
          className="border-border mt-6 flex flex-1 flex-col border-t pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveChanges();
          }}
        >
          <label
            htmlFor={statusId}
            className="text-primary block text-sm font-medium"
          >
            Application status
          </label>

          <div className="relative mt-2">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 left-4 h-2 w-2 -translate-y-1/2 rounded-full ${selectedStyle.dot}`}
            />

            <select
              id={statusId}
              value={status}
              disabled={busy}
              onChange={(event) => {
                setStatus(event.target.value as ApplicationStatus);
                setSaved(false);
              }}
              className={`focus-visible:outline-primary w-full appearance-none rounded-xl border py-3 pr-10 pl-9 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-60 ${selectedStyle.badge}`}
            >
              {statuses.map((value) => (
                <option
                  key={value}
                  value={value}
                  className="bg-background text-primary"
                >
                  {statusStyles[value].label}
                </option>
              ))}
            </select>

            <FiChevronDown
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 ${selectedStyle.badge.split(" ").at(-1)}`}
            />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <label
              htmlFor={notesId}
              className="text-primary text-sm font-medium"
            >
              Personal notes
            </label>

            <span className="text-muted text-xs">Private</span>
          </div>

          <textarea
            id={notesId}
            value={notes}
            maxLength={5000}
            disabled={busy}
            aria-describedby={notesHelpId}
            placeholder="Interview dates, contacts, or next steps…"
            onChange={(event) => {
              setNotes(event.target.value);
              setSaved(false);
            }}
            className="application-notes border-border bg-background text-primary focus-visible:outline-primary mt-2 h-36 w-full resize-none overflow-y-auto rounded-xl border px-4 py-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-60"
          />

          <div
            id={notesHelpId}
            className="text-muted mt-2 flex items-center justify-between gap-3 text-xs"
          >
            <span>{changed ? "Unsaved changes" : "Only visible to you"}</span>

            <span>{notes.length.toLocaleString("en-US")} / 5,000</span>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
            <button
              type="submit"
              disabled={busy || saving || !changed}
              className="bg-primary text-background focus-visible:outline-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-40"
            >
              <FiCheck aria-hidden="true" className="h-4 w-4" />
              {saving ? "Saving…" : "Save changes"}
            </button>

            {saved && !changed ? (
              <p
                role="status"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-800"
              >
                <FiCheck aria-hidden="true" className="h-3.5 w-3.5" />
                Saved
              </p>
            ) : null}
          </div>
        </form>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        aria-busy={removing}
        onCancel={(event) => {
          if (removing) {
            event.preventDefault();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeDeleteDialog();
          }
        }}
        className="application-delete-dialog border-border bg-background text-primary fixed inset-0 m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border p-0 shadow-xl"
      >
        <div className="p-6 sm:p-8">
          <div
            aria-hidden="true"
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700"
          >
            <FiTrash2 className="h-5 w-5" />
          </div>

          <h2
            id={dialogTitleId}
            className="mt-5 text-center text-xl font-semibold"
          >
            Remove application?
          </h2>

          <p className="mt-3 text-center text-sm font-medium">
            {application.title}
          </p>

          <p className="text-muted mt-1 text-center text-sm">
            {application.company}
          </p>

          <p
            id={dialogDescriptionId}
            className="text-muted mt-4 text-center text-sm leading-relaxed"
          >
            This removes the application and its notes from your tracker. Your
            saved job stays unchanged.
          </p>

          {deleteError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
            >
              {deleteError}
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              ref={cancelRef}
              type="button"
              disabled={removing}
              onClick={closeDeleteDialog}
              className="border-border focus-visible:outline-primary rounded-full border px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={busy || removing}
              onClick={() => void confirmDelete()}
              className="rounded-full bg-rose-700 px-4 py-3 text-sm font-medium text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </dialog>
    </article>
  );
}

export default function TrackerPage() {
  const { signedIn, ready, applications, busy, error, reload } =
    useApplications();

  return (
    <section className="bg-background min-h-[65svh] px-4 pt-10 pb-24 sm:px-6 sm:pt-12 sm:pb-32 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h1 id="applications-heading" tabIndex={-1} className="sr-only">
          Your applications
        </h1>

        {!ready ? (
          <div role="status" aria-busy="true" aria-label="Loading applications">
            <span className="sr-only">Loading applications…</span>

            <div aria-hidden="true" className="motion-safe:animate-pulse">
              <div className="bg-surface mb-6 h-10 w-44 rounded-full" />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    key={index}
                    className="border-border rounded-2xl border p-6"
                  >
                    <div className="bg-surface h-7 w-24 rounded-full" />
                    <div className="bg-surface mt-5 h-4 w-1/3 rounded" />
                    <div className="bg-surface mt-4 h-6 w-3/4 rounded" />
                    <div className="bg-surface mt-6 h-11 rounded-xl" />
                    <div className="bg-surface mt-5 h-36 rounded-xl" />
                    <div className="bg-surface mt-5 h-10 w-36 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : !signedIn ? (
          <div className="border-border flex min-h-[340px] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center">
            <h2 className="text-primary text-2xl font-semibold">
              Your applications, in one place
            </h2>

            <p className="text-muted mt-3 max-w-md text-sm">
              Sign in to track your applications and next steps.
            </p>

            <SignInButton mode="modal">
              <button
                type="button"
                className="bg-primary text-background mt-6 rounded-full px-5 py-3 text-sm font-medium"
              >
                Sign in
              </button>
            </SignInButton>
          </div>
        ) : (
          <>
            {error ? (
              <div
                role="alert"
                className="border-border bg-surface mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
              >
                <p className="text-primary text-sm">{error}</p>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reload()}
                  className="text-primary text-sm font-medium underline underline-offset-4 disabled:opacity-50"
                >
                  Refresh applications
                </button>
              </div>
            ) : null}

            {applications.length === 0 ? (
              <div className="border-border flex min-h-[340px] flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center">
                <div
                  aria-hidden="true"
                  className="bg-surface text-muted mb-5 flex h-14 w-14 items-center justify-center rounded-full"
                >
                  <FiSend className="h-6 w-6" />
                </div>

                <h2 className="text-primary text-2xl font-semibold">
                  No applications yet
                </h2>

                <p className="text-muted mt-3 max-w-md text-sm">
                  After visiting a job listing, tell us when you’ve applied.
                  We’ll keep your progress here.
                </p>

                <Link
                  href="/"
                  className="bg-primary text-background mt-6 rounded-full px-5 py-3 text-sm font-medium"
                >
                  Explore jobs
                </Link>
              </div>
            ) : (
              <>
                <p
                  role="status"
                  className="border-border bg-surface text-muted mb-6 inline-flex items-center gap-1.5 rounded-full border px-5 py-2.5 text-sm"
                >
                  <span className="text-primary font-semibold">
                    {applications.length.toLocaleString("en-US")}
                  </span>
                  {applications.length === 1 ? "application" : "applications"}
                </p>

                <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {applications.map((application) => (
                    <ApplicationCard
                      key={application.id}
                      application={application}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
