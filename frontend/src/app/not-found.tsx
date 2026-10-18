import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-5 py-20 text-center"
    >
      <p className="text-muted text-sm font-semibold tracking-[0.25em]">
        ERROR 404
      </p>

      <h1
        id="not-found-title"
        className="text-primary mt-5 text-4xl font-semibold tracking-tight sm:text-5xl"
      >
        Page not found
      </h1>

      <p className="text-muted mt-5 max-w-md text-base leading-relaxed">
        This page may have moved, or the address may be incorrect. Your next
        opportunity is still out there.
      </p>

      <Link
        href="/"
        className="bg-primary text-background focus-visible:outline-primary mt-8 inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3 text-sm font-semibold transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Browse jobs
      </Link>
    </section>
  );
}
