"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { FaCrown } from "react-icons/fa";
import {
  FiArrowRight,
  FiCheck,
  FiFileText,
  FiLock,
  FiMessageCircle,
  FiMinus,
  FiShield,
  FiTarget,
} from "react-icons/fi";

type PremiumPreviewProps = {
  signedIn: boolean;
};

const benefits = [
  {
    icon: FiFileText,
    title: "Start with your experience",
    description:
      "Turn resume text into an editable skills profile. Review everything before saving.",
  },
  {
    icon: FiTarget,
    title: "Find more relevant roles",
    description:
      "See opportunities ranked by your skills, preferred roles, and work preferences.",
  },
  {
    icon: FiMessageCircle,
    title: "Get clarity before applying",
    description:
      "Ask about a selected job, understand possible gaps, and prepare your application.",
  },
  {
    icon: FiShield,
    title: "Keep your profile private",
    description:
      "Your profile and saved AI answers stay separate from other accounts.",
  },
];

const comparison = [
  { label: "Browse developer jobs", free: true, pro: true },
  { label: "Save jobs and track applications", free: true, pro: true },
  { label: "Resume skill extraction", free: false, pro: true },
  { label: "Personalised job recommendations", free: false, pro: true },
  { label: "Job-specific AI assistance", free: false, pro: true },
];

const upgradeClass =
  "bg-primary text-background mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-medium";

function Included({ value }: { value: boolean }) {
  return (
    <span className="inline-flex items-center justify-center">
      {value ? (
        <FiCheck aria-hidden="true" className="h-4 w-4" />
      ) : (
        <FiMinus aria-hidden="true" className="text-muted h-4 w-4" />
      )}
      <span className="sr-only">{value ? "Included" : "Not included"}</span>
    </span>
  );
}

export default function PremiumPreview({ signedIn }: PremiumPreviewProps) {
  return (
    <div className="space-y-7 sm:space-y-9">
      <section
        aria-labelledby="pro-preview-heading"
        className="bg-primary relative isolate overflow-hidden rounded-3xl"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-24 -z-10 h-96 w-96 rounded-full bg-white/[0.06] blur-3xl"
        />

        <div className="grid items-center gap-9 p-6 sm:p-9 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12 lg:p-12">
          <div className="text-background">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium">
              <FaCrown aria-hidden="true" className="h-3.5 w-3.5" />
              StackWing Pro
            </span>

            <h1
              id="pro-preview-heading"
              className="mt-6 max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl"
            >
              Your next role,
              <span className="block text-white/60">with more clarity.</span>
            </h1>

            <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/70 sm:text-base">
              Spend less time sorting through listings. Build your developer
              profile, discover relevant roles, and get focused AI help for your
              next application.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {benefits.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-medium">{title}</h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/60">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <section
            aria-labelledby="pro-price-heading"
            className="border-border bg-background text-primary rounded-3xl border p-6 shadow-[0_12px_40px_rgba(0,0,0,0.15)] sm:p-8"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="bg-surface inline-flex h-10 w-10 items-center justify-center rounded-xl">
                <FaCrown aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="border-border bg-surface text-muted rounded-full border px-3 py-1 text-xs font-medium">
                Monthly plan
              </span>
            </div>

            <h2 id="pro-price-heading" className="mt-5 text-xl font-semibold">
              StackWing Pro
            </h2>
            <p className="text-muted mt-2 text-sm">
              Your skills deserve the right opportunity.
            </p>

            <div className="mt-6 flex flex-wrap items-baseline gap-2">
              <span className="text-6xl leading-none font-semibold tracking-tight">
                $1.99
              </span>
              <span className="text-muted text-sm">/ month</span>
            </div>

            <p className="text-muted mt-3 text-xs">
              Monthly price in USD. AI usage limits apply.
            </p>

            <div className="border-border my-6 border-t" />

            <ul className="space-y-3 text-sm">
              {[
                "Resume-to-profile skill extraction",
                "Skill and role-based recommendations",
                "Job-specific AI questions",
                "Application and interview preparation",
              ].map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5">
                  <FiCheck
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>

            {signedIn ? (
              <Link
                href="/billing"
                aria-describedby="pro-payment-status"
                className={upgradeClass}
              >
                Upgrade to Pro
                <FiArrowRight aria-hidden="true" />
              </Link>
            ) : (
              <SignInButton mode="modal" forceRedirectUrl="/billing">
                <button
                  type="button"
                  aria-describedby="pro-payment-status"
                  className={upgradeClass}
                >
                  Sign in to upgrade
                  <FiArrowRight aria-hidden="true" />
                </button>
              </SignInButton>
            )}

            <p
              id="pro-payment-status"
              className="text-muted mt-3 text-center text-xs leading-relaxed"
            >
              Renews monthly until cancelled.
            </p>
            <p className="text-muted mt-1 text-center text-xs">
              Cancel future renewals from your billing page.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              {signedIn && (
                <Link
                  href="/billing"
                  className="focus-visible:outline-primary rounded text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Manage billing
                </Link>
              )}
              <Link
                href="/"
                className="focus-visible:outline-primary inline-flex items-center gap-1.5 rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Explore jobs
                <FiArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>

            <p className="text-muted mt-5 flex items-center justify-center gap-1.5 text-xs">
              <FiLock aria-hidden="true" className="h-3 w-3" />
              Payment details are handled by Stripe
            </p>
          </section>
        </div>
      </section>

      <section
        aria-labelledby="pro-comparison-heading"
        className="border-border overflow-hidden rounded-3xl border"
      >
        <div className="px-5 pt-6 sm:px-8 sm:pt-8">
          <p className="text-muted text-xs font-medium tracking-wider uppercase">
            What changes with Pro
          </p>
          <h2
            id="pro-comparison-heading"
            className="text-primary mt-2 text-xl font-semibold sm:text-2xl"
          >
            Keep the essentials. Add more direction.
          </h2>
          <p className="text-muted mt-3 max-w-2xl text-sm leading-relaxed">
            Browsing stays free. Pro adds SmartMatch tools for a more focused
            job search.
          </p>
        </div>

        <div className="px-5 pt-5 pb-6 sm:px-8 sm:pb-8">
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">
              StackWing Free and Pro feature comparison
            </caption>
            <thead>
              <tr className="border-border border-b">
                <th
                  scope="col"
                  className="text-muted w-[58%] py-3 pr-3 text-left text-xs font-medium"
                >
                  Features
                </th>
                <th
                  scope="col"
                  className="text-muted w-[21%] px-1 py-3 text-center text-xs font-medium"
                >
                  Free
                </th>
                <th
                  scope="col"
                  className="text-primary bg-surface w-[21%] rounded-t-xl px-1 py-3 text-center text-xs font-semibold"
                >
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((feature) => (
                <tr
                  key={feature.label}
                  className="border-border border-b last:border-b-0"
                >
                  <th
                    scope="row"
                    className="text-primary py-4 pr-3 text-left text-xs leading-relaxed font-normal sm:text-sm"
                  >
                    {feature.label}
                  </th>
                  <td className="text-muted px-1 py-4 text-center">
                    <Included value={feature.free} />
                  </td>
                  <td className="bg-surface text-primary px-1 py-4 text-center">
                    <Included value={feature.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-muted mt-4 text-xs leading-relaxed">
            Saving jobs and tracking applications require an account. AI usage
            limits apply to Pro.
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-surface flex items-start gap-3 rounded-2xl p-5">
          <FiShield
            aria-hidden="true"
            className="text-primary mt-0.5 h-4 w-4 shrink-0"
          />
          <div>
            <h2 className="text-primary text-sm font-medium">
              Your data, your control
            </h2>
            <p className="text-muted mt-2 text-xs leading-relaxed">
              Review your extracted profile before saving. Delete your
              SmartMatch profile and cached answers from your account.
            </p>
          </div>
        </div>

        <div className="bg-surface flex items-start gap-3 rounded-2xl p-5">
          <FiMessageCircle
            aria-hidden="true"
            className="text-primary mt-0.5 h-4 w-4 shrink-0"
          />
          <div>
            <h2 className="text-primary text-sm font-medium">
              Guidance, not guarantees
            </h2>
            <p className="text-muted mt-2 text-xs leading-relaxed">
              Recommendations use available listing information. AI can make
              mistakes, so confirm important details with the employer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
