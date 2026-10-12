"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FiChevronDown, FiRefreshCw, FiZap } from "react-icons/fi";

export type SmartMatchUsageData = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;

  monthly?: {
    used: number;
    limit: number;
    remaining: number;
    resetsAt: string;
  };

  tokens?: {
    daily: {
      committed: number;
      limit: number;
    };
    monthly: {
      committed: number;
      limit: number;
    };
    input: number;
    cachedInput: number;
    output: number;
  };

  spending?: {
    measuredUsd: number;
    committedUsd: number;
    monthlyLimitUsd: number;
    unresolvedRequests: number;
  };
};

type SmartMatchUsageProps = {
  usage: SmartMatchUsageData;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
};

function formatReset(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Reset time unavailable";
  }

  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)} · 00:00 UTC`;
}

function availableHeight(top: number) {
  const viewport = window.visualViewport;

  const viewportBottom =
    (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);

  return Math.max(160, viewportBottom - top - 16);
}

function TokenAllowance({
  label,
  committed,
  limit,
}: {
  label: string;
  committed: number;
  limit: number;
}) {
  const percentage =
    limit > 0 ? Math.min(100, Math.max(0, (committed / limit) * 100)) : 0;

  const exhausted = limit > 0 && committed >= limit;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-primary text-xs font-medium">{label}</p>

        <p className="text-muted text-xs tabular-nums">
          {committed.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
        </p>
      </div>

      {limit > 0 ? (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(Math.max(0, committed), limit)}
          aria-valuetext={`${committed.toLocaleString(
            "en-US",
          )} of ${limit.toLocaleString("en-US")} tokens accounted for`}
          className="bg-border mt-2 h-1.5 overflow-hidden rounded-full"
        >
          <div
            className={`h-full rounded-full ${
              exhausted ? "bg-rose-600" : "bg-primary"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      ) : (
        <p className="text-muted mt-2 text-xs">
          This token allowance is unavailable.
        </p>
      )}

      {exhausted && (
        <p className="mt-2 text-xs text-rose-700">{label} reached.</p>
      )}
    </div>
  );
}

export default function SmartMatchUsage({
  usage,
  onRefresh,
  refreshDisabled = false,
}: SmartMatchUsageProps) {
  const [expanded, setExpanded] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(640);

  const detailsId = useId();

  const cardRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const monthly = usage.monthly;
  const remaining = monthly?.remaining ?? usage.remaining;
  const limit = monthly?.limit ?? usage.limit;
  const exhausted = remaining === 0;

  function toggleDetails() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    const bounds = cardRef.current?.getBoundingClientRect();

    if (bounds) {
      setCollapsedHeight(bounds.height);
      setMaxHeight(availableHeight(bounds.top));
    }

    setExpanded(true);
  }

  useEffect(() => {
    if (!expanded) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setExpanded(false);
      triggerRef.current?.focus();
    }

    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node) || cardRef.current?.contains(target)) {
        return;
      }

      setExpanded(false);
    }

    function handleScroll(event: Event) {
      const target = event.target;

      // Keep the panel open when its own content scrolls.
      if (target instanceof Node && cardRef.current?.contains(target)) {
        return;
      }

      // Page or ancestor scrolling changes the anchor's position.
      // Close instead of increasing the panel's height.
      setExpanded(false);
    }

    function handleViewportChange() {
      setExpanded(false);
    }

    const viewport = window.visualViewport;

    document.addEventListener("keydown", handleEscape, true);
    document.addEventListener("pointerdown", handleOutsidePointer);

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleViewportChange);

    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      document.removeEventListener("keydown", handleEscape, true);

      document.removeEventListener("pointerdown", handleOutsidePointer);

      window.removeEventListener("scroll", handleScroll, true);

      window.removeEventListener("resize", handleViewportChange);

      viewport?.removeEventListener("resize", handleViewportChange);

      viewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [expanded]);

  return (
    <div
      className={`relative w-full sm:max-w-sm ${expanded ? "z-40" : ""}`}
      style={expanded ? { height: collapsedHeight } : undefined}
    >
      <aside
        ref={cardRef}
        aria-label="AI usage allowance"
        className={`border-border bg-surface w-full rounded-2xl border p-4 ${
          expanded
            ? "application-notes absolute inset-x-0 top-0 overflow-y-auto overscroll-contain shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
            : ""
        }`}
        style={expanded ? { maxHeight } : undefined}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="border-border bg-background text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          >
            <FiZap className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-muted text-xs">
              {monthly ? "Monthly AI allowance" : "Daily AI allowance"}
            </p>

            <p
              role="status"
              aria-atomic="true"
              className="text-primary mt-1 text-sm"
            >
              <span className="font-semibold tabular-nums">
                {remaining} / {limit}
              </span>{" "}
              {monthly
                ? "AI requests left this month"
                : "AI generations left today"}
            </p>

            <p className="text-muted mt-2 text-xs leading-relaxed">
              Resets {formatReset(monthly?.resetsAt ?? usage.resetsAt)}
            </p>
          </div>
        </div>

        {exhausted ? (
          <p className="mt-3 text-xs leading-relaxed text-amber-800">
            Your new-request allowance is used up. Cached answers may still be
            available.
          </p>
        ) : (
          <p className="text-muted mt-3 text-xs leading-relaxed">
            Cached answers don’t use new allowance.
          </p>
        )}

        <button
          ref={triggerRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={toggleDetails}
          className="text-primary focus-visible:outline-primary mt-3 inline-flex items-center gap-2 rounded text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Usage details
          <FiChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <div
            id={detailsId}
            role="region"
            aria-label="AI usage details"
            className="border-border mt-4 space-y-4 border-t pt-4"
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">Available today</span>

              <span className="text-primary font-medium tabular-nums">
                {usage.remaining}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">New requests used today</span>

              <span className="text-primary tabular-nums">
                {usage.used} / {usage.limit}
              </span>
            </div>

            <p className="text-muted text-xs leading-relaxed">
              Daily reset: {formatReset(usage.resetsAt)}
            </p>

            {usage.tokens && (
              <>
                <TokenAllowance
                  label="Daily token allowance"
                  committed={usage.tokens.daily.committed}
                  limit={usage.tokens.daily.limit}
                />

                <TokenAllowance
                  label="Monthly token allowance"
                  committed={usage.tokens.monthly.committed}
                  limit={usage.tokens.monthly.limit}
                />

                <p className="text-muted text-xs leading-relaxed">
                  Tokens are pieces of text read or generated by AI. Longer
                  requests use more. Input and output tokens count toward these
                  allowances, including cached input.
                </p>
              </>
            )}

            {Boolean(usage.spending?.unresolvedRequests) && (
              <p className="text-muted text-xs leading-relaxed">
                Some allowance remains reserved for active or unconfirmed
                requests.
              </p>
            )}

            <p className="text-muted text-xs leading-relaxed">
              Token and spending safeguards may pause new requests before the
              generation limit is reached.
            </p>

            {onRefresh && (
              <button
                type="button"
                disabled={refreshDisabled}
                onClick={onRefresh}
                className="border-border text-primary focus-visible:outline-primary hover:bg-background inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiRefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Refresh usage
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
