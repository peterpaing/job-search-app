"use client";

import { useState, type FormEvent } from "react";

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

function emptyFilters(): JobFilterValues {
  return {
    sources: [],
    company: "",
    postedWithin: "",
  };
}

export default function JobFilters({ onApply, onClear }: JobFiltersProps) {
  const [filters, setFilters] = useState<JobFilterValues>(emptyFilters);
  const [isApplied, setIsApplied] = useState(false);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isApplied) {
      setFilters(emptyFilters());
      setIsApplied(false);
      onClear?.();
      return;
    }

    onApply?.({
      ...filters,
      sources: [...filters.sources],
      company: filters.company.trim(),
    });

    setIsApplied(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-primary text-lg font-semibold">Filters</h2>

      <fieldset className="space-y-3">
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
          value={filters.company ?? ""}
          onChange={(event) => updateField("company", event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-primary text-sm font-medium">Date posted</span>

        <select
          name="postedWithin"
          value={filters.postedWithin}
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
        className="bg-primary text-background hover:bg-muted focus-visible:outline-primary w-full rounded-full px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {isApplied ? "Clear filters" : "Apply filters"}
      </button>
    </form>
  );
}
