"use client";

import {
  Suspense,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineMapPin,
  HiOutlineXMark,
} from "react-icons/hi2";

const inputClass =
  "text-primary caret-primary placeholder:text-muted focus:bg-surface focus:ring-primary/20 selection:bg-primary selection:text-background w-full min-w-0 rounded-xl bg-transparent py-3 pr-10 pl-3 text-sm font-medium transition-colors placeholder:font-normal focus:ring-2 focus:outline-none";

const clearButtonClass =
  "text-muted hover:text-primary focus-visible:outline-primary absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full opacity-100 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [keyword, setKeyword] = useState(
    () => new URLSearchParams(initialQuery).get("q") ?? "",
  );

  const [location, setLocation] = useState(
    () => new URLSearchParams(initialQuery).get("location") ?? "",
  );

  const keywordRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const appliedQueryRef = useRef(initialQuery);

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    const destination = query ? `${pathname}?${query}` : pathname;

    appliedQueryRef.current = query;

    startTransition(() => {
      router.push(destination, { scroll: false });
    });
  }

  function clearSearchField(field: "q" | "location") {
    if (isPending) {
      return;
    }

    if (field === "q") {
      setKeyword("");
      keywordRef.current?.focus();
    } else {
      setLocation("");
      locationRef.current?.focus();
    }

    const params = new URLSearchParams(appliedQueryRef.current);

    // Clearing an unapplied draft does not need a backend request.
    if (!params.has(field)) {
      return;
    }

    params.delete(field);
    params.delete("page");

    navigate(params);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const params = new URLSearchParams(appliedQueryRef.current);
    const nextKeyword = keyword.trim();
    const nextLocation = location.trim();

    params.delete("q");
    params.delete("location");
    params.delete("page");

    if (nextKeyword) {
      params.set("q", nextKeyword);
    }

    if (nextLocation) {
      params.set("location", nextLocation);
    }

    setKeyword(nextKeyword);
    setLocation(nextLocation);

    navigate(params);
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Search developer jobs"
      aria-busy={isPending}
      className="border-border bg-background shadow-primary/10 relative mt-6 flex flex-col gap-3 rounded-3xl border p-3 shadow-xl sm:mt-8 sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
        <HiOutlineMagnifyingGlass
          className="text-muted h-5 w-5 shrink-0"
          aria-hidden="true"
        />

        <div className="group relative min-w-0 flex-1">
          <label htmlFor="job-keyword" className="sr-only">
            Job title or keyword
          </label>

          <input
            ref={keywordRef}
            id="job-keyword"
            name="q"
            type="search"
            placeholder="Job title or keyword"
            value={keyword}
            disabled={isPending}
            onChange={(event) => setKeyword(event.target.value)}
            className={`${inputClass} [&::-webkit-search-cancel-button]:appearance-none`}
          />

          {keyword !== "" && (
            <button
              type="button"
              aria-label="Clear job title or keyword"
              disabled={isPending}
              onClick={() => clearSearchField("q")}
              className={clearButtonClass}
            >
              <HiOutlineXMark className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="border-border flex min-w-0 flex-1 items-center gap-3 border-t px-3 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
        <HiOutlineMapPin
          className="text-muted h-5 w-5 shrink-0"
          aria-hidden="true"
        />

        <div className="group relative min-w-0 flex-1">
          <label htmlFor="job-location" className="sr-only">
            Country or city
          </label>

          <input
            ref={locationRef}
            id="job-location"
            name="location"
            type="text"
            placeholder="Add country or city"
            value={location}
            disabled={isPending}
            onChange={(event) => setLocation(event.target.value)}
            className={inputClass}
          />

          {location !== "" && (
            <button
              type="button"
              aria-label="Clear country or city"
              disabled={isPending}
              onClick={() => clearSearchField("location")}
              className={clearButtonClass}
            >
              <HiOutlineXMark className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-primary text-background hover:bg-muted focus-visible:outline-primary shrink-0 rounded-full px-8 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Searching..." : "Search"}
      </button>
    </form>
  );
}

function SearchFromUrl() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return <SearchForm key={query} initialQuery={query} />;
}

export default function JobSearch() {
  return (
    <Suspense
      fallback={
        <div role="status" className="text-primary mt-6 py-4 text-sm sm:mt-8">
          Loading search...
        </div>
      }
    >
      <SearchFromUrl />
    </Suspense>
  );
}
