"use client";

import { SignInButton, useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaCrown } from "react-icons/fa";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiCheckCircle,
  FiCreditCard,
  FiExternalLink,
  FiFileText,
  FiLock,
  FiMessageCircle,
  FiRefreshCw,
  FiShield,
  FiTarget,
} from "react-icons/fi";

type BillingStatus = {
  premium: boolean;
  customerExists: boolean;
  blocked: boolean;
  status: string;
  paidUntil: string | null;
  cancelAtPeriodEnd: boolean;
  mode: "test" | "live";
  price: {
    amount: number;
    currency: string;
    interval: string;
  };
};

type BillingAction = "checkout" | "portal" | "refresh";

const primaryButton =
  "bg-primary text-background focus-visible:outline-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

const secondaryButton =
  "border-border text-primary hover:bg-surface focus-visible:outline-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

const iconButton =
  "border-border text-muted hover:bg-surface hover:text-primary focus-visible:outline-primary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

const features = [
  { icon: FiTarget, label: "Personalised SmartMatch recommendations" },
  { icon: FiFileText, label: "Resume-to-profile skill extraction" },
  { icon: FiMessageCircle, label: "Job-specific AI guidance" },
];

function LoadingCard() {
  return (
    <div
      role="status"
      aria-label="Loading billing"
      aria-busy="true"
      className="border-border bg-background overflow-hidden rounded-3xl border"
    >
      <span className="sr-only">Loading billing…</span>

      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="border-border flex items-center gap-3 border-b p-6 sm:p-8">
          <div className="bg-surface h-11 w-11 rounded-xl" />
          <div>
            <div className="bg-surface h-5 w-36 rounded" />
            <div className="bg-surface mt-2 h-4 w-24 rounded" />
          </div>
        </div>

        <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-2">
          <div>
            <div className="bg-surface h-12 w-40 rounded" />
            <div className="bg-surface mt-6 h-4 w-3/4 rounded" />
            <div className="bg-surface mt-4 h-4 w-2/3 rounded" />
            <div className="bg-surface mt-4 h-4 w-3/4 rounded" />
          </div>
          <div>
            <div className="bg-surface h-6 w-40 rounded" />
            <div className="bg-surface mt-4 h-20 rounded-xl" />
            <div className="bg-surface mt-6 h-12 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BillingStatus | null }) {
  let label = "Status unavailable";
  let color = "border-border bg-surface text-muted";

  if (status?.blocked) {
    label = "Needs review";
    color = "border-rose-200 bg-rose-50 text-rose-700";
  } else if (status?.premium && status.cancelAtPeriodEnd) {
    label = "Cancellation scheduled";
    color = "border-amber-200 bg-amber-50 text-amber-800";
  } else if (status?.premium) {
    label = "Pro active";
    color = "border-emerald-200 bg-emerald-50 text-emerald-700";
  } else if (status) {
    label = "Not active";
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${color}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      {label}
    </span>
  );
}

function SubscriptionDetails({ status }: { status: BillingStatus }) {
  const paidDate = status.paidUntil
    ? new Date(status.paidUntil).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const paidPeriodEnded = status.paidUntil
    ? Date.parse(status.paidUntil) <= Date.now()
    : false;

  const subscriptionEnded = ["canceled", "incomplete_expired"].includes(
    status.status,
  );

  const renewalOff = status.cancelAtPeriodEnd || subscriptionEnded;

  const renewalOn =
    status.premium &&
    status.status === "active" &&
    !status.blocked &&
    !status.cancelAtPeriodEnd &&
    !paidPeriodEnded;

  const hasSubscription = status.customerExists && status.status !== "none";

  if (!paidDate && !hasSubscription) return null;

  let renewalLabel = "Check status";
  let renewalColor = "border-border bg-background text-muted";
  let renewalDescription =
    "Open Manage subscription to check your current renewal settings.";

  if (renewalOff) {
    renewalLabel = "Off";
    renewalColor = "border-amber-200 bg-amber-50 text-amber-800";

    renewalDescription = subscriptionEnded
      ? "This subscription has ended and will not renew."
      : status.premium && paidDate
        ? `Your subscription will not renew. Pro access continues until ${paidDate}.`
        : "Cancellation is scheduled. Your subscription will not renew.";
  } else if (renewalOn) {
    renewalLabel = "On";
    renewalColor = "border-emerald-200 bg-emerald-50 text-emerald-700";
    renewalDescription =
      "Your subscription is set to renew monthly. Turn off future renewals through Manage subscription.";
  }

  return (
    <div className="border-border bg-surface/50 mt-5 rounded-xl border px-4 py-4">
      {paidDate && (
        <div>
          <p className="text-muted text-xs">
            {paidPeriodEnded
              ? "Last paid period ended"
              : status.cancelAtPeriodEnd
                ? "Access ends"
                : "Paid through"}
          </p>
          <p className="text-primary mt-1 text-sm font-medium">{paidDate}</p>
        </div>
      )}

      {hasSubscription && (
        <div className={paidDate ? "border-border mt-4 border-t pt-4" : ""}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-primary inline-flex items-center gap-2 text-sm font-medium">
              <FiRefreshCw
                aria-hidden="true"
                className="text-muted h-4 w-4 shrink-0"
              />
              Auto-renew
            </span>

            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${renewalColor}`}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-current"
              />
              {renewalLabel}
            </span>
          </div>

          <p className="text-muted mt-3 text-xs leading-relaxed">
            {renewalDescription}
          </p>
        </div>
      )}
    </div>
  );
}

function BillingWorkspace({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) {
  const clerk = useClerk();

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<BillingAction | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const busy = activeAction !== null;

  const mounted = useRef(false);
  const operation = useRef(false);
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    mounted.current = true;
    const activeControllers = controllers.current;

    return () => {
      mounted.current = false;
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
    };
  }, []);

  const request = useCallback(
    async <T,>(
      path: string,
      method = "GET",
      body?: unknown,
      cancellation?: AbortSignal,
    ): Promise<T> => {
      function isCurrent() {
        return (
          mounted.current &&
          !cancellation?.aborted &&
          clerk.user?.id === userId &&
          clerk.session?.id === sessionId
        );
      }

      if (!isCurrent()) throw new Error("Your account changed.");

      const token = await clerk.session?.getToken();

      if (!token || !isCurrent()) {
        throw new Error("Please sign in again.");
      }

      const controller = new AbortController();
      controllers.current.add(controller);
      const timer = setTimeout(() => controller.abort(), 45_000);

      try {
        const url = new URL(
          `/api/billing${path}`,
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
        );

        const response = await fetch(url, {
          method,
          cache: "no-store",
          signal: cancellation
            ? AbortSignal.any([controller.signal, cancellation])
            : controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });

        const value: unknown = await response.json();

        if (!isCurrent()) throw new Error("Your account changed.");

        if (!response.ok) {
          const message =
            typeof value === "object" &&
            value !== null &&
            "message" in value &&
            typeof value.message === "string"
              ? value.message
              : "Billing could not complete this request.";

          throw new Error(message);
        }

        return value as T;
      } finally {
        clearTimeout(timer);
        controllers.current.delete(controller);
      }
    },
    [clerk, userId, sessionId],
  );

  useEffect(() => {
    const cancellation = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams(window.location.search);
        const session = params.get("session_id");
        let nextStatus: BillingStatus;

        if (params.get("checkout") === "success" && session) {
          nextStatus = await request<BillingStatus>(
            "/confirm",
            "POST",
            { sessionId: session },
            cancellation.signal,
          );

          if (!cancellation.signal.aborted) {
            window.history.replaceState(window.history.state, "", "/billing");
            setNotice(
              nextStatus.premium
                ? "Your payment is verified. Pro is ready."
                : "Payment was checked. Refresh if access is still updating.",
            );
          }
        } else if (params.get("returned") === "portal") {
          nextStatus = await request<BillingStatus>(
            "/refresh",
            "POST",
            undefined,
            cancellation.signal,
          );

          if (!cancellation.signal.aborted) {
            window.history.replaceState(window.history.state, "", "/billing");
          }
        } else {
          nextStatus = await request<BillingStatus>(
            "/status",
            "GET",
            undefined,
            cancellation.signal,
          );

          if (
            params.get("checkout") === "cancelled" &&
            !cancellation.signal.aborted
          ) {
            setNotice("Checkout was cancelled.");
          }
        }

        if (!cancellation.signal.aborted) setStatus(nextStatus);
      } catch (failure) {
        if (!cancellation.signal.aborted && mounted.current) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load billing.",
          );
        }
      } finally {
        if (!cancellation.signal.aborted && mounted.current) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => cancellation.abort();
  }, [request]);

  async function run(kind: BillingAction, action: () => Promise<void>) {
    if (operation.current) return;

    operation.current = true;
    setActiveAction(kind);
    setError(null);
    setNotice(null);

    try {
      await action();
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Billing is temporarily unavailable.",
        );
      }
    } finally {
      operation.current = false;
      if (mounted.current) setActiveAction(null);
    }
  }

  function redirectToStripe(url: string) {
    const target = new URL(url);

    if (
      target.protocol !== "https:" ||
      !["checkout.stripe.com", "billing.stripe.com"].includes(target.hostname)
    ) {
      throw new Error("Unexpected payment destination.");
    }

    window.location.assign(target.href);
  }

  function openCheckout() {
    if (!consent || !status || status.blocked) return;

    void run("checkout", async () => {
      const result = await request<{ url: string }>("/checkout", "POST", {
        consent: true,
      });
      redirectToStripe(result.url);
    });
  }

  function openPortal() {
    void run("portal", async () => {
      const result = await request<{ url: string }>("/portal", "POST");
      redirectToStripe(result.url);
    });
  }

  function refresh() {
    void run("refresh", async () => {
      const nextStatus = await request<BillingStatus>("/refresh", "POST");
      setStatus(nextStatus);
      setNotice("Billing status refreshed.");
    });
  }

  const amount = status
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: status.price.currency,
      }).format(status.price.amount / 100)
    : "$1.99";

  const refreshLabel =
    activeAction === "refresh"
      ? "Refreshing billing status"
      : "Refresh billing status";

  return (
    <div className="space-y-4">
      {status?.mode === "test" && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <FiShield aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-xs leading-relaxed sm:text-sm">
            <span className="font-medium">Sandbox mode.</span> No real money is
            charged. Use Stripe test payment details, not a real card.
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800"
        >
          <FiAlertCircle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <div>
            <p className="text-sm font-medium">
              We couldn’t complete that request
            </p>
            <p className="mt-1 text-xs leading-relaxed sm:text-sm">{error}</p>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <FiCheckCircle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <LoadingCard />
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-3xl border">
          <header className="border-border flex flex-wrap items-center justify-between gap-4 border-b p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="bg-surface text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                <FaCrown aria-hidden="true" className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-primary text-lg font-semibold">
                  StackWing Pro
                </h2>
                <p className="text-muted mt-1 text-xs">Monthly subscription</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={status} />
              <button
                type="button"
                disabled={busy}
                onClick={refresh}
                aria-label={refreshLabel}
                title={refreshLabel}
                className={iconButton}
              >
                <FiRefreshCw
                  aria-hidden="true"
                  className={`h-4 w-4 ${
                    activeAction === "refresh" ? "motion-safe:animate-spin" : ""
                  }`}
                />
              </button>
            </div>
          </header>

          <div className="grid md:grid-cols-2">
            <section
              aria-labelledby="billing-plan-heading"
              className="bg-surface/60 p-5 sm:p-7"
            >
              <p
                id="billing-plan-heading"
                className="text-muted text-xs font-medium tracking-wider uppercase"
              >
                Your plan
              </p>

              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className="text-primary text-5xl font-semibold tracking-tight">
                  {amount}
                </span>
                <span className="text-muted text-sm">USD / month</span>
              </div>

              <p className="text-muted mt-3 text-sm leading-relaxed">
                A more focused developer job search.
              </p>

              <ul className="mt-7 space-y-4">
                {features.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-start gap-3">
                    <span className="border-border bg-background flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                      <Icon
                        aria-hidden="true"
                        className="text-primary h-3.5 w-3.5"
                      />
                    </span>
                    <span className="text-primary pt-1.5 text-sm leading-relaxed">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-border text-muted mt-7 flex items-start gap-2.5 border-t pt-5 text-xs leading-relaxed">
                <FiLock
                  aria-hidden="true"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span>
                  Payment details are handled by Stripe. StackWing doesn’t store
                  your card details.
                </span>
              </div>
            </section>

            <section
              aria-labelledby="billing-actions-heading"
              className="border-border border-t p-5 sm:p-7 md:border-t-0 md:border-l"
            >
              <h3
                id="billing-actions-heading"
                className="text-primary text-base font-semibold"
              >
                {status?.blocked
                  ? "Your account needs review"
                  : status?.premium
                    ? "You’re ready to use Pro"
                    : status
                      ? "Get started with Pro"
                      : "Let’s check your subscription"}
              </h3>

              <p className="text-muted mt-2 text-sm leading-relaxed">
                {status?.blocked
                  ? "Contact support about the billing hold. You can still manage your subscription below."
                  : status?.premium
                    ? "Your Pro access is active. Manage billing here or continue to SmartMatch."
                    : status
                      ? "Continue to Stripe to review your subscription and enter payment details."
                      : "Your billing status couldn’t be loaded. Refresh it before starting checkout."}
              </p>

              {status && <SubscriptionDetails status={status} />}

              {status && !status.premium && !status.blocked && (
                <div className="border-border mt-6 rounded-2xl border p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={busy}
                      onChange={(event) => setConsent(event.target.checked)}
                      aria-describedby="billing-renewal-details"
                      className="accent-primary focus-visible:outline-primary mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
                    />
                    <span className="text-primary text-sm leading-relaxed">
                      I agree to pay {amount} USD per month, renewing
                      automatically until cancelled.
                    </span>
                  </label>

                  <p
                    id="billing-renewal-details"
                    className="text-muted mt-3 pl-7 text-xs leading-relaxed"
                  >
                    Cancel future renewals from your billing portal. Access
                    continues until the paid period ends.
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-3">
                {status?.premium && (
                  <Link
                    href="/smart-match"
                    className={`${primaryButton} w-full`}
                  >
                    Open SmartMatch
                    <FiArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                )}

                {status && !status.premium && !status.blocked && (
                  <button
                    type="button"
                    disabled={busy || !consent}
                    onClick={openCheckout}
                    className={`${primaryButton} w-full`}
                  >
                    <FiCreditCard aria-hidden="true" className="h-4 w-4" />
                    {activeAction === "checkout"
                      ? "Opening checkout…"
                      : "Continue to checkout"}
                    <FiArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}

                {status?.customerExists && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={openPortal}
                    className={`${secondaryButton} w-full`}
                  >
                    {activeAction === "portal"
                      ? "Opening billing portal…"
                      : "Manage subscription"}
                    <FiExternalLink aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}

                {!status && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={refresh}
                    className={`${primaryButton} w-full`}
                  >
                    <FiRefreshCw
                      aria-hidden="true"
                      className={`h-4 w-4 ${
                        activeAction === "refresh"
                          ? "motion-safe:animate-spin"
                          : ""
                      }`}
                    />
                    {activeAction === "refresh"
                      ? "Checking status…"
                      : "Retry billing status"}
                  </button>
                )}
              </div>

              {status && !status.premium && !status.blocked && (
                <p className="text-muted mt-3 flex items-center justify-center gap-1.5 text-center text-xs">
                  <FiLock aria-hidden="true" className="h-3 w-3 shrink-0" />
                  Checkout opens on Stripe
                </p>
              )}
            </section>
          </div>

          <footer className="border-border border-t px-5 py-4 sm:px-7">
            <details>
              <summary className="text-muted focus-visible:outline-primary cursor-pointer rounded text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
                Usage and subscription details
              </summary>

              <div className="text-muted mt-3 space-y-3 text-xs leading-relaxed">
                {[
                  "Existing AI request, token, and spending limits apply to Pro.",
                  "Cancelling or resubscribing does not reset your allowance.",
                  "Premium access is verified by the backend after payment confirmation.",
                ].map((detail) => (
                  <p key={detail} className="flex items-start gap-2">
                    <FiCheck
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                    <span>{detail}</span>
                  </p>
                ))}
              </div>
            </details>
          </footer>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();

  return (
    <section className="bg-background min-h-[80svh] px-4 pt-8 pb-24 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <Link
            href="/profile"
            aria-label="Back to your account"
            title="Back to your account"
            className={iconButton}
          >
            <FiArrowLeft aria-hidden="true" className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-primary text-xl font-semibold tracking-tight sm:text-2xl">
              Billing
            </h1>
            <p className="text-muted mt-1 text-sm">
              Manage your StackWing Pro subscription.
            </p>
          </div>
        </div>

        {!isLoaded ? (
          <LoadingCard />
        ) : !isSignedIn || !userId || !sessionId ? (
          <div className="border-border bg-background rounded-3xl border p-6 sm:p-8">
            <span className="bg-surface text-primary flex h-12 w-12 items-center justify-center rounded-xl">
              <FaCrown aria-hidden="true" className="h-5 w-5" />
            </span>
            <h2 className="text-primary mt-5 text-xl font-semibold">
              Your Pro subscription, in one place.
            </h2>
            <p className="text-muted mt-3 max-w-md text-sm leading-relaxed">
              Sign in to subscribe, check your access, or manage your billing
              details.
            </p>
            <SignInButton mode="modal" forceRedirectUrl="/billing">
              <button type="button" className={`${primaryButton} mt-6`}>
                Sign in to continue
                <FiArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </SignInButton>
          </div>
        ) : (
          <BillingWorkspace
            key={`${userId}:${sessionId}`}
            userId={userId}
            sessionId={sessionId}
          />
        )}
      </div>
    </section>
  );
}
