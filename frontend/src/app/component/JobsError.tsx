"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  HiOutlineArrowPath,
  HiOutlineExclamationTriangle,
} from "react-icons/hi2";

export default function JobsError() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function retry() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      aria-busy={isPending}
      className="border-border bg-background flex min-h-[250px] flex-col items-center justify-center rounded-2xl border p-6 text-center sm:p-10"
    >
      <HiOutlineExclamationTriangle
        aria-hidden="true"
        className="text-muted h-9 w-9"
      />

      <div role="alert">
        <h3 className="text-primary mt-4 text-lg font-semibold">
          We couldn’t load jobs
        </h3>

        <p className="text-muted mt-2 max-w-sm text-sm leading-relaxed">
          Please try again in a moment. Your search and filters are still saved.
        </p>
      </div>

      <button
        type="button"
        onClick={retry}
        disabled={isPending}
        className="bg-primary text-background hover:bg-muted focus-visible:outline-primary mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
      >
        <HiOutlineArrowPath
          aria-hidden="true"
          className={`h-4 w-4 ${isPending ? "motion-safe:animate-spin" : ""}`}
        />

        {isPending ? "Trying again…" : "Try again"}
      </button>

      {isPending && (
        <p role="status" className="text-muted mt-3 text-sm">
          Loading jobs…
        </p>
      )}
    </div>
  );
}
