const sources = [
  "Remote OK",
  "We Work Remotely",
  "Himalayas",
  "Dev Global Jobs",
];

const selectClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function JobFilters() {
  return (
    <div className="space-y-6">
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
              className="accent-primary h-4 w-4"
            />
            {source}
          </label>
        ))}
      </fieldset>

      <label className="block space-y-2">
        <span className="text-primary text-sm font-medium">
          Employment type
        </span>

        <select name="employmentType" className={selectClass}>
          <option value="">Any type</option>
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="temporary">Temporary</option>
          <option value="internship">Internship</option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-primary text-sm font-medium">
          Experience level
        </span>

        <select name="seniority" className={selectClass}>
          <option value="">Any level</option>
          <option value="entry-level">Entry-level</option>
          <option value="mid-level">Mid-level</option>
          <option value="senior">Senior</option>
          <option value="manager">Manager</option>
          <option value="director">Director</option>
          <option value="executive">Executive</option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-primary text-sm font-medium">Country</span>

        <input
          type="text"
          name="country"
          placeholder="Enter country"
          className={selectClass}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-primary text-sm font-medium">Date posted</span>

        <select name="postedWithin" className={selectClass}>
          <option value="">Any time</option>
          <option value="1">Past 24 hours</option>
          <option value="7">Past 7 days</option>
          <option value="30">Past 30 days</option>
        </select>
      </label>

      <label className="text-muted flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="salaryDisclosed"
          className="accent-primary h-4 w-4"
        />
        Salary disclosed only
      </label>

      <button
        type="button"
        className="bg-primary text-background hover:bg-muted focus-visible:outline-primary w-full rounded-full px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Apply filters
      </button>
    </div>
  );
}
