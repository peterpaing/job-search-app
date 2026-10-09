import { Suspense } from "react";
import Intro from "./component/Intro";
import type { Job } from "./component/JobCard";
import JobsError from "./component/JobsError";
import JobsLayout from "./component/JobsLayout";
import JobsList from "./component/JobsList";
import JobsLoading from "./component/JobsLoading";

type JobsResponse = {
  jobs: Job[];
  total: number;
};

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function JobResults({ queryString }: { queryString: string }) {
  let data: JobsResponse;

  try {
    const apiUrl = new URL(
      process.env.JOBS_API_URL ?? "http://localhost:5000/api/jobs",
    );

    apiUrl.search = queryString;

    const response = await fetch(apiUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch jobs: ${response.status}`);
    }

    data = await response.json();

    if (!Array.isArray(data.jobs)) {
      throw new Error("The jobs response is invalid.");
    }
  } catch (error) {
    console.error("Failed to load job results:", error);

    return <JobsError />;
  }

  return <JobsList key={queryString} jobs={data.jobs} />;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  const selectedSources = params.source;

  if (Array.isArray(selectedSources)) {
    for (const source of selectedSources) {
      query.append("source", source);
    }
  } else if (typeof selectedSources === "string") {
    query.append("source", selectedSources);
  }

  if (typeof params.q === "string" && params.q.trim()) {
    query.set("q", params.q.trim());
  }

  if (typeof params.location === "string" && params.location.trim()) {
    query.set("location", params.location.trim());
  }

  if (typeof params.company === "string" && params.company.trim()) {
    query.set("company", params.company.trim());
  }

  if (typeof params.postedWithin === "string" && params.postedWithin !== "") {
    query.set("postedWithin", params.postedWithin);
  }

  const queryString = query.toString();

  return (
    <>
      <Intro />

      <JobsLayout>
        <Suspense key={queryString} fallback={<JobsLoading />}>
          <JobResults queryString={queryString} />
        </Suspense>
      </JobsLayout>
    </>
  );
}
