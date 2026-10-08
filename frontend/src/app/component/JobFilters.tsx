"use client";

import { Suspense, useState, useTransition, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const sources = [
  "Remote OK",
  "We Work Remotely",
  "Himalayas",
  "Dev Global Jobs",
];

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export type JobFilterValues = {
  sources: string[];
  company: string;
  postedWithin: string;
};

type JobFiltersProps = {
  onApply?: (filters: JobFilterValues) => void;
  onClear?: () => void;
};

type FilterFormProps = JobFiltersProps & {
  initialQuery: string;
};

function emptyFilters(): JobFilterValues {
  return {
    sources: [],
    company: "",
    postedWithin: "",
  };
}

function readFilters(query: string): JobFilterValues {
  const params = new URLSearchParams(query);
  const postedWithin = params.get("postedWithin") ?? "";

  return {
    sources: [
      ...new Set(
        params.getAll("source").filter((source) => sources.includes(source)),
      ),
    ],
    company: params.get("company")?.trim() ?? "",
    postedWithin: ["1", "7", "30"].includes(postedWithin) ? postedWithin : "",
  };
}

function hasFilters(filters: JobFilterValues) {
  return (
    filters.sources.length > 0 ||
    filters.company !== "" ||
    filters.postedWithin !== ""
  );
}

function JobFiltersForm({ initialQuery, onApply, onClear }: FilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<JobFilterValues>(() =>
    readFilters(initialQuery),
  );

  const [isApplied, setIsApplied] = useState(() =>
    hasFilters(readFilters(initialQuery)),
  );

  function toggleSource(source: string) {
    setFilters((previous) => ({
      ...previous,
      sources: previous.sources.includes(source)
        ? previous.sources.filter((value) => value !== source)
        : [...previous.sources, source],
    }));

    setIsApplied(false);
  }

  function updateField<K extends keyof JobFilterValues>(
    field: K,
    value: JobFilterValues[K],
  ) {
    setFilters((previous) => ({
      ...previous,
      [field]: value,
    }));

    setIsApplied(false);
  }

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.push(url, { scroll: false });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const params = new URLSearchParams(initialQuery);

    // Replace only filter parameters and reset URL pagination.
    params.delete("source");
    params.delete("company");
    params.delete("postedWithin");
    params.delete("page");

    if (isApplied) {
      setFilters(emptyFilters());
      setIsApplied(false);
      onClear?.();
      navigate(params);
      return;
    }

    const appliedFilters: JobFilterValues = {
      sources: [...filters.sources],
      company: filters.company.trim(),
      postedWithin: filters.postedWithin,
    };

    for (const source of appliedFilters.sources) {
      params.append("source", source);
    }

    if (appliedFilters.company) {
      params.set("company", appliedFilters.company);
    }

    if (appliedFilters.postedWithin) {
      params.set("postedWithin", appliedFilters.postedWithin);
    }

    setFilters(appliedFilters);
    setIsApplied(hasFilters(appliedFilters));
    onApply?.(appliedFilters);
    navigate(params);
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} className="space-y-6">
      <h2 className="text-primary text-lg font-semibold">Filters</h2>

      <fieldset disabled={isPending} className="space-y-3">
        <legend className="text-primary mb-3 text-sm font-medium">
          Job source
        </legend>

        {sources.map((source) => (
          <label
            key={source}
            className="text-muted flex cursor-pointer items-center gap-3 text-sm"
          >
            <input
              type="checkbox"
              name="source"
              value={source}
              checked={filters.sources.includes(source)}
              onChange={() => toggleSource(source)}
              className="accent-primary h-4 w-4"
            />
            {source}
          </label>
        ))}
      </fieldset>

      <label className="block space-y-2">
        <span className="text-primary text-sm font-medium">Company</span>

        <input
          type="text"
          name="company"
          placeholder="Enter company name"
          value={filters.company}
          disabled={isPending}
          onChange={(event) => updateField("company", event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-primary text-sm font-medium">Date posted</span>

        <select
          name="postedWithin"
          value={filters.postedWithin}
          disabled={isPending}
          onChange={(event) => updateField("postedWithin", event.target.value)}
          className={inputClass}
        >
          <option value="">Any time</option>
          <option value="1">Past 24 hours</option>
          <option value="7">Past 7 days</option>
          <option value="30">Past 30 days</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="bg-primary text-background hover:bg-muted focus-visible:outline-primary w-full rounded-full px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending
          ? "Updating..."
          : isApplied
            ? "Clear filters"
            : "Apply filters"}
      </button>
    </form>
  );
}

function JobFiltersFromUrl(props: JobFiltersProps) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return <JobFiltersForm key={query} initialQuery={query} {...props} />;
}

export default function JobFilters(props: JobFiltersProps) {
  return (
    <Suspense
      fallback={<p className="text-muted text-sm">Loading filters...</p>}
    >
      <JobFiltersFromUrl {...props} />
    </Suspense>
  );
}
