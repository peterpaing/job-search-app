"use client";

import { SignUp, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function AccountLoading() {
  return (
    <div role="status" className="w-full max-w-md">
      <span className="sr-only">Loading account…</span>

      <div
        aria-hidden="true"
        className="border-border bg-surface h-96 rounded-2xl border motion-safe:animate-pulse"
      />
    </div>
  );
}

export default function SignUpPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/profile");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    function recoverVerificationHistory() {
      const pathname = window.location.pathname.replace(/\/+$/, "");

      if (pathname === "/sign-up/protect-check") {
        // Replace the stale history entry and reload the signup form.
        window.location.replace("/sign-up");
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        recoverVerificationHistory();
      }
    }

    window.addEventListener("popstate", recoverVerificationHistory);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("popstate", recoverVerificationHistory);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <section className="bg-background px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto flex max-w-7xl justify-center">
        {!isLoaded || isSignedIn ? (
          <AccountLoading />
        ) : (
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            fallbackRedirectUrl="/profile"
            fallback={<AccountLoading />}
          />
        )}
      </div>
    </section>
  );
}
