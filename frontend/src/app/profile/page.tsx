"use client";

import { SignIn, SignOutButton, UserProfile, useUser } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
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
      title: "Broken job link",
      description: "Include the job title, company, and job link.",
    },
    {
      title: "Report a bug",
      description: "Describe what happened and the steps to reproduce it.",
    },
    {
      title: "Subscription issue",
      description: "Describe the billing issue. Never include payment details.",
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
                href={`mailto:${supportEmail}?subject=${encodeURIComponent(
                  `StackWing: ${issue.title}`,
                )}&body=${encodeURIComponent(
                  `${issue.description}\n\nDetails:\n`,
                )}`}
                className={`${buttonClass} mt-4`}
              >
                Email support
              </a>
            )}
          </div>
        ))}

        <p className="text-muted text-xs leading-relaxed">
          {supportEmail
            ? "Email support opens your email app. Your report is sent only when you send the email."
            : "Support contact details have not been configured yet."}
        </p>
      </div>
    </AccountSection>
  );
}

function DeleteAccount() {
  return (
    <AccountSection
      title="Delete account"
      description="Permanently remove your account and its associated app data."
    >
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-red-800">
          Account deletion is not connected yet
        </h3>

        <p className="mt-2 text-sm leading-relaxed text-red-800">
          We need a secure backend flow that removes your StackWing data and
          your Clerk account together. Deleting only the Clerk account would not
          automatically remove data stored in our database.
        </p>

        <button
          type="button"
          disabled
          className="mt-5 rounded-full bg-red-700 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete account — unavailable
        </button>
      </div>
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
