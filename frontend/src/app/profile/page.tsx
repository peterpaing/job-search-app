"use client";

import {
  SignIn,
  SignOutButton,
  UserProfile,
  useClerk,
  useReverification,
  useUser,
} from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  HiOutlineArrowRight,
  HiOutlineArrowRightOnRectangle,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCreditCard,
  HiOutlineLockClosed,
  HiOutlineTrash,
} from "react-icons/hi2";

const buttonClass =
  "border-border text-primary hover:bg-surface focus-visible:outline-primary inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

const primaryButtonClass =
  "bg-primary text-background focus-visible:outline-primary inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2";

function AccountSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="text-primary">
      <div className="border-border mb-6 border-b pb-5">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted mt-2 text-sm leading-relaxed">{description}</p>
      </div>

      {children}
    </div>
  );
}

function ProSubscription() {
  return (
    <AccountSection
      title="Pro subscription"
      description="Manage your StackWing Pro subscription and payment details."
    >
      <div className="border-border rounded-2xl border p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="bg-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <HiOutlineCreditCard aria-hidden="true" className="h-5 w-5" />
          </span>

          <div>
            <h3 className="text-base font-semibold">StackWing Pro</h3>
            <p className="text-muted mt-1 text-sm">
              Your subscription, in one place.
            </p>
          </div>
        </div>

        <p className="text-muted mt-5 text-sm leading-relaxed">
          View your current access and paid period, update your payment method,
          download invoices, or cancel future renewals.
        </p>

        <Link href="/billing" className={`${primaryButtonClass} mt-6`}>
          Open billing & subscription
          <HiOutlineArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>

        <div className="border-border mt-6 border-t pt-5">
          <p className="text-muted text-xs leading-relaxed">
            Cancellation stops future renewals. Your Pro access continues until
            the paid period ends. Existing AI allowances still apply.
          </p>
        </div>
      </div>
    </AccountSection>
  );
}

function Privacy() {
  return (
    <AccountSection
      title="Privacy"
      description="Understand how your account information is used."
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold">Account information</h3>
          <p className="text-muted mt-2 text-sm leading-relaxed">
            Clerk manages your sign-in account, including your name, avatar,
            email addresses, connected sign-in methods, and sessions.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Profile visibility</h3>
          <p className="text-muted mt-2 text-sm leading-relaxed">
            StackWing does not currently provide a public member profile page.
            Your account panel is intended for you to manage your own account.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Job browsing</h3>
          <p className="text-muted mt-2 text-sm leading-relaxed">
            You can browse and search job listings without creating an account.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Payments and subscriptions</h3>
          <p className="text-muted mt-2 text-sm leading-relaxed">
            Stripe handles payment details and subscription billing. StackWing
            stores billing references and subscription status to verify your Pro
            access, but does not store your card details.
          </p>
        </div>
      </div>
    </AccountSection>
  );
}

function HelpAndFeedback() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  const issues = [
    {
      title: "Subscription issue",
      description: "Describe the billing issue. Never include payment details.",
    },
    {
      title: "AI issue",
      description:
        "Describe what went wrong with SmartMatch and include any error message. Never include sensitive personal information.",
    },
    {
      title: "Report a bug",
      description: "Describe what happened and the steps to reproduce it.",
    },
  ];

  return (
    <AccountSection
      title="Help & feedback"
      description="Report an issue or tell us how StackWing can improve."
    >
      <div className="space-y-4">
        {issues.map((issue) => (
          <div
            key={issue.title}
            className="border-border rounded-2xl border p-5"
          >
            <h3 className="text-sm font-semibold">{issue.title}</h3>

            <p className="text-muted mt-2 text-sm leading-relaxed">
              {issue.description}
            </p>

            {supportEmail && (
              <a
                href={`https://mail.google.com/mail/?${new URLSearchParams({
                  tf: "cm",
                  to: supportEmail,
                  su: `StackWing: ${issue.title}`,
                  body: `${issue.description}\n\nDetails:\n`,
                }).toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonClass} mt-4`}
              >
                Email support
              </a>
            )}
          </div>
        ))}

        <p className="text-muted text-xs leading-relaxed">
          {supportEmail
            ? "Email support opens Gmail in a new tab. Your report is sent only when you send the email."
            : "Support contact details have not been configured yet."}
        </p>
      </div>
    </AccountSection>
  );
}

function DeleteAccount() {
  const clerk = useClerk();

  const confirmationId = useId();

  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(false);
  const pending = useRef(false);

  const enabled = process.env.NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED === "true";

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const submitDeletion = useReverification(
    async (
      expectedUserId: string,
      expectedSessionId: string,
    ): Promise<unknown> => {
      const session = clerk.session;

      function ensureCurrent() {
        if (
          !mounted.current ||
          clerk.user?.id !== expectedUserId ||
          clerk.session?.id !== expectedSessionId
        ) {
          throw new Error("Your account changed. Please try again.");
        }
      }

      ensureCurrent();

      if (!session || session.id !== expectedSessionId) {
        throw new Error("Please sign in again.");
      }

      // Obtain a fresh token after any reverification prompt.
      const token = await session.getToken({ skipCache: true });
      ensureCurrent();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch(
        new URL(
          "/api/account/deletion",
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
        ),
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirmation: "DELETE" }),
        },
      );

      const result: unknown = await response.json();
      ensureCurrent();

      // Return Clerk's hint unchanged so the hook can open verification.
      if (
        response.status === 403 &&
        typeof result === "object" &&
        result !== null &&
        "clerk_error" in result
      ) {
        return result;
      }

      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "message" in result &&
          typeof result.message === "string"
            ? result.message
            : "Unable to confirm your deletion request. Please try again.";

        throw new Error(message);
      }

      return result;
    },
  );

  async function deleteAccount() {
    if (!enabled || pending.current || accepted || confirmation !== "DELETE") {
      return;
    }

    const expectedUserId = clerk.user?.id;
    const expectedSessionId = clerk.session?.id;

    if (!expectedUserId || !expectedSessionId) {
      setError("Please sign in again.");
      return;
    }

    pending.current = true;
    setBusy(true);
    setError(null);

    try {
      const result = await submitDeletion(expectedUserId, expectedSessionId);

      if (!result) return;

      if (
        typeof result !== "object" ||
        !("status" in result) ||
        (result.status !== "pending" && result.status !== "completed")
      ) {
        throw new Error(
          "Unable to confirm your deletion request. Please try again.",
        );
      }

      if (
        !mounted.current ||
        clerk.user?.id !== expectedUserId ||
        clerk.session?.id !== expectedSessionId
      ) {
        return;
      }

      setAccepted(true);

      try {
        sessionStorage.removeItem(
          `dev-jobs:pending-application-visits:v2:user:${encodeURIComponent(
            expectedUserId,
          )}`,
        );
      } catch {
        // Storage restrictions must not cancel a saved deletion request.
      }

      try {
        await clerk.signOut({
          sessionId: expectedSessionId,
        });
      } catch {
        // The cleanup worker may already have removed this session.
      } finally {
        // Do not interrupt a different account selected during deletion.
        if (!clerk.session || clerk.session.id === expectedSessionId) {
          window.location.replace(new URL("/", window.location.origin).href);
        }
      }
    } catch (failure) {
      if (mounted.current && !isReverificationCancelledError(failure)) {
        setError(
          failure instanceof Error && failure.name !== "TimeoutError"
            ? failure.message
            : "Unable to confirm the request. It may already be queued. Please try again.",
        );
      }
    } finally {
      pending.current = false;

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <AccountSection
      title="Delete account"
      description="Permanently remove your sign-in account and private app data."
    >
      <form
        className="rounded-2xl border border-red-200 bg-red-50 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void deleteAccount();
        }}
      >
        <h3 className="text-sm font-semibold text-red-800">
          Permanently delete your account
        </h3>

        <p className="mt-2 text-sm leading-relaxed text-red-800">
          This removes your saved jobs, applications, SmartMatch profile, and
          cached answers. Pro access ends when deletion is requested. Your
          subscription will be canceled without an automatic refund.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-red-800">
          Deletion may continue after you sign out. Billing cancellation is
          confirmed before your sign-in account is deleted. Limited billing and
          AI accounting records are retained separately.
        </p>

        <label
          htmlFor={confirmationId}
          className="mt-5 block text-sm font-medium text-red-800"
        >
          Type DELETE to confirm
        </label>

        <input
          id={confirmationId}
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={!enabled || busy || accepted}
          className="mt-2 block w-full max-w-sm rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50"
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {accepted && (
          <p role="status" className="mt-3 text-sm text-red-800">
            Your deletion request is saved. Cleanup will continue after you sign
            out.
          </p>
        )}

        <button
          type="submit"
          disabled={!enabled || busy || accepted || confirmation !== "DELETE"}
          className="mt-5 rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Requesting deletion…" : "Delete account"}
        </button>
      </form>
    </AccountSection>
  );
}

function SignOut() {
  return (
    <AccountSection
      title="Sign out"
      description="Sign out of StackWing on this browser."
    >
      <div className="border-border rounded-2xl border p-5 sm:p-6">
        <p className="text-muted mb-5 text-sm leading-relaxed">
          You can continue browsing jobs after signing out. Sign in again
          whenever you want to manage your account.
        </p>

        <SignOutButton redirectUrl="/">
          <button type="button" className={buttonClass}>
            Sign out
          </button>
        </SignOutButton>
      </div>
    </AccountSection>
  );
}

export default function ProfilePage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <section className="bg-background px-4 py-10 sm:px-6 lg:px-8">
        <div role="status" className="mx-auto max-w-7xl">
          <span className="sr-only">Loading account…</span>
          <div
            aria-hidden="true"
            className="border-border bg-surface h-[600px] rounded-2xl border motion-safe:animate-pulse"
          />
        </div>
      </section>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="bg-background px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto flex max-w-7xl justify-center">
          <SignIn
            routing="hash"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/profile"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-background px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-7xl min-w-0">
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: {
                width: "100%",
                maxWidth: "100%",
              },
              cardBox: {
                width: "100%",
                maxWidth: "100%",
              },
              card: {
                width: "100%",
                maxWidth: "100%",
                boxShadow: "0 8px 30px rgba(0, 0, 0, 0.05)",
              },
            },
          }}
        >
          <UserProfile.Page label="account" />
          <UserProfile.Page label="security" />

          <UserProfile.Page
            label="Pro subscription"
            url="subscription"
            labelIcon={<HiOutlineCreditCard aria-hidden="true" />}
          >
            <ProSubscription />
          </UserProfile.Page>

          <UserProfile.Page
            label="Privacy"
            url="privacy"
            labelIcon={<HiOutlineLockClosed aria-hidden="true" />}
          >
            <Privacy />
          </UserProfile.Page>

          <UserProfile.Page
            label="Help & feedback"
            url="help"
            labelIcon={<HiOutlineChatBubbleLeftRight aria-hidden="true" />}
          >
            <HelpAndFeedback />
          </UserProfile.Page>

          <UserProfile.Page
            label="Delete account"
            url="delete-account"
            labelIcon={<HiOutlineTrash aria-hidden="true" />}
          >
            <DeleteAccount />
          </UserProfile.Page>

          <UserProfile.Page
            label="Sign out"
            url="sign-out"
            labelIcon={<HiOutlineArrowRightOnRectangle aria-hidden="true" />}
          >
            <SignOut />
          </UserProfile.Page>
        </UserProfile>
      </div>
    </section>
  );
}
