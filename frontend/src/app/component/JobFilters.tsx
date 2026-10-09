"use client";

import {
  Suspense,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
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

function sameFilters(left: JobFilterValues, right: JobFilterValues) {
  return (
    left.company.trim() === right.company &&
    left.postedWithin === right.postedWithin &&
    left.sources.length === right.sources.length &&
    left.sources.every((source) => right.sources.includes(source))
  );
}

function JobFiltersForm({ initialQuery, onApply, onClear }: FilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<JobFilterValues>(() =>
    readFilters(initialQuery),
  );

  const [appliedFilters, setAppliedFilters] = useState<JobFilterValues>(() =>
    readFilters(initialQuery),
  );

  const appliedQueryRef = useRef(initialQuery);

  const isApplied =
    hasFilters(appliedFilters) && sameFilters(filters, appliedFilters);

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;

    appliedQueryRef.current = query;

    startTransition(() => {
      router.push(url, { scroll: false });
    });
  }

  function toggleSource(source: string) {
    if (isPending) {
      return;
    }

    const removing = filters.sources.includes(source);

    setFilters({
      ...filters,
      sources: removing
        ? filters.sources.filter((value) => value !== source)
        : [...filters.sources, source],
    });

    // Newly selected sources remain drafts until Apply is clicked.
    if (!removing || !appliedFilters.sources.includes(source)) {
      return;
    }

    // Remove only the applied source, preserving other applied criteria.
    const nextApplied: JobFilterValues = {
      ...appliedFilters,
      sources: appliedFilters.sources.filter((value) => value !== source),
    };

    const params = new URLSearchParams(appliedQueryRef.current);

    params.delete("source");
    params.delete("page");

    for (const value of nextApplied.sources) {
      params.append("source", value);
    }

    setAppliedFilters(nextApplied);

    if (hasFilters(nextApplied)) {
      onApply?.(nextApplied);
    } else {
      onClear?.();
    }

    navigate(params);
  }

  function updateField<K extends keyof JobFilterValues>(
    field: K,
    value: JobFilterValues[K],
  ) {
    setFilters((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    const params = new URLSearchParams(appliedQueryRef.current);

    params.delete("source");
    params.delete("company");
    params.delete("postedWithin");
    params.delete("page");

    if (isApplied) {
      setFilters(emptyFilters());
      setAppliedFilters(emptyFilters());
      onClear?.();
      navigate(params);
      return;
    }

    const nextApplied: JobFilterValues = {
      sources: [...filters.sources],
      company: filters.company.trim(),
      postedWithin: filters.postedWithin,
    };

    for (const source of nextApplied.sources) {
      params.append("source", source);
    }

    if (nextApplied.company) {
      params.set("company", nextApplied.company);
    }

    if (nextApplied.postedWithin) {
      params.set("postedWithin", nextApplied.postedWithin);
    }

    setFilters(nextApplied);
    setAppliedFilters(nextApplied);
    onApply?.(nextApplied);
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
