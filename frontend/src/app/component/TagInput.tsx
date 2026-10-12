"use client";

import { useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";

type TagInputProps = {
  id: string;
  label: string;
  values: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onChange: (values: string[]) => void;
  maxItems: number;
  maxItemLength: number;
  disabled?: boolean;
  placeholder?: string;
};

export function mergeTags(
  current: string[],
  pending: string,
  maxItems: number,
  maxItemLength: number,
) {
  const result: string[] = [];
  const seen = new Set<string>();

  const candidates = [...current, ...pending.split(",")];

  for (const candidate of candidates) {
    const value = candidate.trim();

    if (!value) {
      continue;
    }

    if (value.length > maxItemLength) {
      throw new Error(
        `Each item must be ${maxItemLength} characters or fewer.`,
      );
    }

    const key = value.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }

  if (result.length > maxItems) {
    throw new Error(`You can add up to ${maxItems} items.`);
  }

  return result;
}

export default function TagInput({
  id,
  label,
  values,
  inputValue,
  onInputChange,
  onChange,
  maxItems,
  maxItemLength,
  disabled = false,
  placeholder,
}: TagInputProps) {
  const [error, setError] = useState<string | null>(null);

  function addItems(value = inputValue) {
    if (disabled || !value.trim()) {
      return;
    }

    try {
      const next = mergeTags(values, value, maxItems, maxItemLength);

      onChange(next);
      onInputChange("");
      setError(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Couldn’t add this item.",
      );
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-primary text-sm font-medium">
          {label}
        </label>

        <span className="text-muted text-xs">
          {values.length} / {maxItems}
        </span>
      </div>

      <div className="border-border bg-background mt-2 rounded-xl border p-3">
        {values.length > 0 && (
          <ul
            aria-label={`${label} added`}
            className="mb-3 flex list-none flex-wrap gap-2"
          >
            {values.map((value) => (
              <li key={value.toLowerCase()}>
                <span className="bg-surface text-primary inline-flex max-w-full items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 text-sm">
                  <span className="break-all">{value}</span>

                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Remove ${value}`}
                    onClick={() => {
                      onChange(values.filter((entry) => entry !== value));
                      setError(null);
                    }}
                    className="text-muted focus-visible:outline-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
                  >
                    <FiX aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <input
            id={id}
            value={inputValue}
            disabled={disabled}
            maxLength={maxItemLength}
            aria-describedby={`${id}-help`}
            aria-invalid={error ? true : undefined}
            placeholder={placeholder}
            onChange={(event) => {
              onInputChange(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return;
              }

              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addItems();
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");

              if (text.includes(",")) {
                event.preventDefault();
                addItems(`${inputValue}${text}`);
              }
            }}
            className="text-primary focus-visible:outline-primary min-w-0 flex-1 rounded-lg bg-transparent px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />

          <button
            type="button"
            disabled={disabled || !inputValue.trim()}
            onClick={() => addItems()}
            aria-label={`Add to ${label.toLowerCase()}`}
            className="bg-primary text-background focus-visible:outline-primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <FiPlus aria-hidden="true" />
            Add
          </button>
        </div>
      </div>

      <p id={`${id}-help`} className="text-muted mt-2 text-xs">
        Type an item and press Enter. You can also paste a comma-separated list.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
