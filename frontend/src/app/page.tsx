import Intro from "./component/Intro";
import type { Job } from "./component/JobCard";
import JobsLayout from "./component/JobsLayout";
import JobsList from "./component/JobsList";

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
        <JobsList jobs={data.jobs} />
      </JobsLayout>
    </>
  );
}
