import Intro from "./component/Intro";
import JobCard, { type Job } from "./component/JobCard";
import JobsLayout from "./component/JobsLayout";

type JobsResponse = {
  jobs: Job[];
  total: number;
};

export default async function Home() {
  const response = await fetch("http://localhost:5000/api/jobs", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status}`);
  }

  const data: JobsResponse = await response.json();

  return (
    <>
      <Intro />

      <JobsLayout>
        {data.jobs.length === 0 ? (
          <p className="text-muted">No jobs found.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </JobsLayout>
    </>
  );
}
