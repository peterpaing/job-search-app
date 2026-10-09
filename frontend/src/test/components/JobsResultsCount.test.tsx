type JobsResultsCountProps = {
  total: number;
};

export default function JobsResultsCount({ total }: JobsResultsCountProps) {
  return (
    <div className="mb-6 flex justify-start pl-1">
      <p
        role="status"
        aria-label="Job results count"
        aria-live="polite"
        aria-atomic="true"
        className="border-border bg-surface text-muted inline-flex items-center rounded-full border px-4 py-2 text-xs sm:text-sm"
      >
        <span>
          <span className="text-primary font-semibold tabular-nums">
            {total.toLocaleString("en-US")}
          </span>{" "}
          {total === 1 ? "job found" : "jobs found"}
        </span>
      </p>
    </div>
  );
}
